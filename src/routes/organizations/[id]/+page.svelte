<script lang="ts">
	import { page } from '$app/state';
	import { organizations, peers, firstArray } from '$lib/api/client';
	import type { OrganizationHome, LeaderboardEntry, PeerPoolSeat } from '$lib/api/types';
	import { SpdApiError } from '$lib/api/base';
	import { session } from '$lib/state/session.svelte';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtNumber, fmtTime } from '$lib/format';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import Select from '$lib/components/Select.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import DataView from '$lib/components/DataView.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import type { Column } from '$lib/components/table';
	import Dialog from '$lib/components/Dialog.svelte';

	const id = $derived(page.params.id ?? '');

	let home = $state<OrganizationHome | null>(null);
	let error = $state('');
	let tab = $state('overview');
	let supplyData = $state<Record<string, unknown[]>>({ vectors: [], 'restriction-enzymes': [], reagents: [], materials: [] });
	let leaderboard = $state<LeaderboardEntry[]>([]);
	let researchers = $state<unknown[]>([]);

	async function load() {
		try {
			home = await organizations.home(id);
			error = '';
		} catch (e) {
			error = e instanceof SpdApiError ? `${e.code}: ${e.message}` : String(e);
		}
	}
	$effect(() => void load());

	$effect(() => {
		if (tab === 'supplies' && home) {
			const oid = home.organization.id;
			void (async () => {
				const [v, r, g, m] = await Promise.allSettled([
					organizations.vectors(oid),
					organizations.restrictionEnzymes(oid),
					organizations.reagents(oid),
					organizations.materials(oid)
				]);
				supplyData = {
					vectors: v.status === 'fulfilled' ? firstArray(v.value) : [],
					'restriction-enzymes': r.status === 'fulfilled' ? firstArray(r.value) : [],
					reagents: g.status === 'fulfilled' ? firstArray(g.value) : [],
					materials: m.status === 'fulfilled' ? firstArray(m.value) : []
				};
			})();
		}
		if (tab === 'leaderboard' && home) {
			void organizations.leaderboard(home.organization.id)
				.then((d) => (leaderboard = firstArray<LeaderboardEntry>(d, 'leaderboard', 'entries')))
				.catch(() => (leaderboard = []));
		}
		if (tab === 'researchers' && home && session.signedIn) {
			void organizations.researchers(home.organization.id)
				.then((d) => (researchers = firstArray(d)))
				.catch(() => (researchers = []));
		}
		if (tab === 'peers' && home && session.signedIn) void loadSeats();
	});

	// Peer pool (§46): leader-only management; a 403 just reads as "not
	// your pool to manage" rather than an error page.
	let seats = $state<PeerPoolSeat[]>([]);
	let seatsDenied = $state(false);
	let nominateOrcid = $state('');
	let sponsorPick = $state('');

	async function loadSeats() {
		if (!home) return;
		try {
			const d = await peers.pool(home.organization.id);
			seats = Array.isArray(d.seats) ? d.seats : [];
			seatsDenied = false;
		} catch {
			seats = [];
			seatsDenied = true;
		}
	}
	async function doNominate() {
		if (!home || !nominateOrcid.trim()) return;
		try {
			await peers.nominate(home.organization.id, nominateOrcid.trim());
			toastOk(tr('peers_nominate'));
			nominateOrcid = '';
			await loadSeats();
		} catch (e) {
			toastErr(e);
		}
	}
	async function doRemove(seatId: string) {
		if (!home) return;
		try {
			await peers.remove(home.organization.id, seatId);
			toastOk(tr('peers_remove'));
			await loadSeats();
		} catch (e) {
			toastErr(e);
		}
	}

	// Profile editing is a key/value row list, not a JSON textarea: leaders
	// manage fields like description/website without touching the merge-patch
	// wire format. Removed rows translate to RFC7386 null deletions on save.
	let profileRows = $state<Array<{ key: string; value: string; orig: unknown }>>([]);
	let showProfileEditor = $state(false);
	const serialized = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v));
	function openProfileEditor() {
		const p = (orgProfile ?? {}) as Record<string, unknown>;
		profileRows = Object.entries(p).map(([key, value]) => ({ key, value: serialized(value), orig: value }));
		showProfileEditor = true;
	}
	function addProfileRow() {
		profileRows = [...profileRows, { key: '', value: '', orig: undefined }];
	}
	function removeProfileRow(i: number) {
		profileRows = profileRows.filter((_, j) => j !== i);
	}
	async function saveProfile() {
		const orig = (orgProfile ?? {}) as Record<string, unknown>;
		const patch: Record<string, unknown> = {};
		for (const r of profileRows) {
			const k = r.key.trim();
			if (!k) continue;
			const same = r.value === serialized(r.orig);
			if (same && k in orig) continue;
			if (typeof r.orig === 'string') patch[k] = r.value;
			else {
				try {
					patch[k] = JSON.parse(r.value);
				} catch {
					patch[k] = r.value;
				}
			}
		}
		for (const k of Object.keys(orig)) {
			if (!profileRows.some((r) => r.key.trim() === k)) patch[k] = null;
		}
		if (!Object.keys(patch).length) return (showProfileEditor = false);
		try {
			await organizations.patchProfile(home?.organization.id ?? id, patch);
			toastOk(tr('org_profile_saved'));
			showProfileEditor = false;
			await load();
		} catch (e) {
			toastErr(e);
		}
	}

	// human profile rendering: known keys first, scalars inline, nested values
	// stay collapsible JSON
	const PREFERRED_PROFILE = ['description', 'summary', 'website', 'location', 'contactEmail'];
	const isScalar = (v: unknown) => v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
	function profilePairs(p: Record<string, unknown>): Array<[string, unknown]> {
		const head = PREFERRED_PROFILE.filter((k) => k in p);
		const rest = Object.keys(p).filter((k) => !PREFERRED_PROFILE.includes(k));
		return [...head, ...rest].map((k) => [k, p[k]]);
	}

	const SPONSORS = ['none', 'bronze', 'silver', 'gold', 'platinum'];

	// researchers management
	let addUserId = $state('');
	async function addResearcher() {
		if (!addUserId.trim() || !home) return;
		try {
			await organizations.addResearcher(home.organization.id, addUserId.trim(), home.organization.id);
			toastOk(tr('org_researcher_added'));
			addUserId = '';
			researchers = firstArray(await organizations.researchers(home.organization.id));
		} catch (e) {
			toastErr(e);
		}
	}
	async function removeResearcher(userId: string) {
		if (!home || !confirm(tr('org_remove_confirm'))) return;
		try {
			await organizations.removeResearcher(home.organization.id, userId);
			researchers = firstArray(await organizations.researchers(home.organization.id));
		} catch (e) {
			toastErr(e);
		}
	}

	const lbColumns: Column<LeaderboardEntry>[] = [
		{ key: 'orcidId', label: 'ORCID' },
		{ key: 'displayName', label: tr('f_displayName') },
		{ key: 'factor', label: 'SPD Factor', format: (r) => r.factor.toFixed(1) },
		{ key: 'validationCount', label: tr('org_validations'), format: (r) => fmtNumber(r.validationCount) }
	];

	const isLeader = $derived(session.signedIn && home?.members?.some((m) => m.id === session.user?.orcidId && m.role === 'leader'));
	const orgId = $derived(home?.organization.id ?? '');
	const orgProfile = $derived(home?.organization.profile ?? {});
</script>

{#if error}
	<div class="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
		<p class="font-medium">{tr('page_not_found')}</p><p class="mt-1">{error}</p>
	</div>
{:else if !home}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{:else}
	<div class="space-y-4">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h1 class="text-2xl font-bold">{home.organization.name}</h1>
				<div class="mt-1 flex flex-wrap items-center gap-2 text-sm">
					<Badge tone={home.organization.status === 'active' ? 'ok' : 'warn'}>{enumLabel('st', home.organization.status)}</Badge>
					{#if home.organization.sponsorLevel && home.organization.sponsorLevel !== 'none'}
						<Badge tone="info">{enumLabel('sponsor', home.organization.sponsorLevel)}</Badge>
					{/if}
					<code class="font-mono text-xs text-muted-foreground">{home.organization.id}</code>
					{#if home.organization.domain}<span class="text-xs text-muted-foreground">{home.organization.domain}</span>{/if}
				</div>
				{#if home.organization.department}<p class="mt-1 text-sm text-muted-foreground">{home.organization.department}</p>{/if}
			</div>
			<div class="flex flex-wrap gap-2">
				<PageTools />
				{#if session.isAdmin}
					<Select
						name="org_sponsor"
						class="h-8 w-40 text-xs"
						placeholder={tr('org_set_sponsor')}
						bind:value={sponsorPick}
						options={[{ value: '', label: tr('org_set_sponsor') }, ...SPONSORS.map((s) => ({ value: s, label: s }))]}
						onchange={() => {
							if (!sponsorPick) return;
							organizations.setSponsor(orgId, sponsorPick).then(() => { toastOk(tr('org_sponsor_set')); load(); }).catch(toastErr);
						}}
					/>
				{/if}
				{#if isLeader}
					<Button size="sm" variant="outline" onclick={openProfileEditor}>{tr('org_edit_profile')}</Button>
				{/if}
			</div>
		</div>

		<div class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
			{#each Object.entries(home.stats ?? {}) as [k, v] (k)}
				<div class="rounded-none border p-2 text-center">
					<p class="text-lg font-semibold tabular-nums">{fmtNumber(v as number)}</p>
					<p class="truncate text-[10px] text-muted-foreground">{tr(`f_${k}`)}</p>
				</div>
			{/each}
		</div>

		<Tabs
			bind:active={tab}
			items={[
				{ key: 'overview', label: tr('tab_overview'), badge: home.members.length },
				{ key: 'supplies', label: tr('org_supplies') },
				{ key: 'leaderboard', label: tr('org_leaderboard') },
				{ key: 'researchers', label: tr('org_researchers') },
				{ key: 'peers', label: tr('org_tab_peers'), badge: seats.length }
			]}
		/>

		{#if tab === 'overview'}
			<Section title={tr('org_members')}>
				{#if home.members.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
				{:else}
					<ul class="grid gap-1 sm:grid-cols-2">
						{#each home.members as m (`${m.id}`)}
							<li class="flex items-center gap-2 text-sm">
								<a class="underline" href={`https://orcid.org/${m.id}`} target="_blank" rel="noopener">{m.displayName}</a>
								<Badge tone={m.role === 'leader' ? 'info' : 'muted'}>{m.role}</Badge>
								<code class="font-mono text-[10px] text-muted-foreground">{m.id}</code>
							</li>
						{/each}
					</ul>
				{/if}
			</Section>
			{#if home.organization.profile && Object.keys(home.organization.profile).length}
				{@const prof = home.organization.profile as Record<string, unknown>}
				<Section title={tr('org_profile')}>
					<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
						{#each profilePairs(prof) as [k, v] (k)}
							{#if isScalar(v)}
								<dt class="text-muted-foreground">{tr(`f_${k}`)}</dt>
								<dd class="break-words">{String(v)}</dd>
							{:else}
								<dd class="col-span-2"><DataView label={tr(`f_${k}`)} value={v} /></dd>
							{/if}
						{/each}
					</dl>
				</Section>
			{/if}
		{:else if tab === 'supplies'}
			<div class="grid gap-4 lg:grid-cols-2">
				{#each Object.entries(supplyData) as [key, rows] (key)}
					<Section title={tr(`org_supply_${key}`)}>
						{#if rows.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
						{:else}
							<ul class="divide-y text-sm">
								{#each rows as raw, i (i)}
									{@const item = raw as Record<string, unknown>}
									<li class="flex flex-wrap items-center gap-2 py-1.5">
										<span class="font-medium">{String(item.name ?? item.id ?? '')}</span>
										{#if item.catalogNumber}<code class="text-xs text-muted-foreground">{String(item.catalogNumber)}</code>{/if}
										{#if item.orderUrl}<a class="text-xs underline" href={String(item.orderUrl)} target="_blank" rel="noopener">{tr('org_order')}</a>{/if}
										{#if item.verified}<Badge tone="ok">{tr('org_verified')}</Badge>{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</Section>
				{/each}
			</div>
		{:else if tab === 'leaderboard'}
			<Section title={tr('org_leaderboard')}>
				{#if leaderboard.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
				{:else}<DataTable rows={leaderboard} columns={lbColumns} />{/if}
			</Section>
		{:else if tab === 'researchers'}
			<Section title={tr('org_researchers')}>
				{#if !session.signedIn}
					<p class="text-sm text-muted-foreground">{tr('org_researchers_private')}</p>
				{:else}
					{#if researchers.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
					{:else}
						<ul class="divide-y text-sm">
							{#each researchers as raw, i (i)}
								{@const r = raw as Record<string, unknown>}
								<li class="flex items-center gap-3 py-1.5">
									<span>{String(r.displayName ?? r.userId ?? '')}</span>
									<code class="font-mono text-xs text-muted-foreground">{String(r.userId ?? '')}</code>
									<Badge tone="muted">{String(r.role ?? '')}</Badge>
									{#if isLeader && r.role !== 'leader'}
										<Button size="xs" variant="ghost" onclick={() => removeResearcher(String(r.userId ?? ''))}>{tr('common_delete')}</Button>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
					{#if isLeader}
						<div class="mt-3 flex gap-2">
							<Input name="org_add_user" class="h-8 flex-1 font-mono text-xs" placeholder={tr('org_add_researcher_placeholder')} bind:value={addUserId} />
							<Button size="sm" onclick={addResearcher}>{tr('common_create')}</Button>
						</div>
					{/if}
				{/if}
			</Section>
		{:else if tab === 'peers'}
			<Section title={tr('org_tab_peers')}>
				{#if !session.signedIn || seatsDenied}
					<p class="text-sm text-muted-foreground">{tr('peers_not_leader')}</p>
				{:else}
					{#if seats.length === 0}<p class="text-sm text-muted-foreground">{tr('peers_empty')}</p>
					{:else}
						<ul class="divide-y text-sm">
							{#each seats as s (s.id)}
								<li class="flex flex-wrap items-center gap-2 py-1.5">
									<a class="underline" href={`/users/${s.orcid}`}>{s.displayName || s.orcid}</a>
									<code class="font-mono text-xs text-muted-foreground">{s.orcid}</code>
									<Badge tone={s.status === 'active' ? 'ok' : 'warn'}>{enumLabel('seat', s.status)}</Badge>
									<span class="text-xs text-muted-foreground">{tr('peers_col_invited')} {fmtTime(s.invitedAt)}</span>
									{#if s.acceptedAt}<span class="text-xs text-muted-foreground">{tr('peers_col_accepted')} {fmtTime(Number(s.acceptedAt))}</span>{/if}
									{#if isLeader}
										<Button size="xs" variant="ghost" onclick={() => doRemove(s.id)}>{tr('peers_remove')}</Button>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
					{#if isLeader}
						<div class="mt-3 border-t pt-3">
							<div class="flex gap-2">
								<Select
									name="org_nominate"
									class="h-8 flex-1"
									placeholder={tr('peers_nominate')}
									bind:value={nominateOrcid}
									options={[{ value: '', label: tr('peers_nominate') }, ...home.members.filter((m) => m.role !== 'leader').map((m) => ({ value: String(m.id), label: `${m.displayName || m.id} · ${m.id}` }))]}
								/>
								<Button size="sm" onclick={doNominate} disabled={!nominateOrcid}>{tr('peers_nominate')}</Button>
								<InfoTip
									text={tr('peers_nominate_hint')}
									label={`${tr('peers_nominate')} — ${tr('common_more_info')}`}
								/>
							</div>
						</div>
					{/if}
				{/if}
			</Section>
		{/if}
	</div>

	<Dialog
		bind:open={showProfileEditor}
		title={tr('org_edit_profile')}
		hint={tr('org_profile_editor_hint')}
		width="max-w-2xl"
	>
		<div class="space-y-2">
			{#each profileRows as r, i (i)}
				<div class="flex items-center gap-2">
					<Input name="org_profile_key" class="h-8 w-44 shrink-0 font-mono text-xs" placeholder={tr('org_profile_key_ph')} bind:value={r.key} />
					<Input name="org_profile_value" class="h-8 flex-1" placeholder={tr('org_profile_value_ph')} bind:value={r.value} />
					<Button size="xs" variant="ghost" onclick={() => removeProfileRow(i)}>{tr('org_profile_remove_field')}</Button>
				</div>
			{/each}
		</div>
		<div class="mt-2"><Button size="xs" variant="outline" onclick={addProfileRow}>{tr('org_profile_add_field')}</Button></div>
		<div class="mt-3 flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (showProfileEditor = false)}>{tr('common_cancel')}</Button>
			<Button onclick={saveProfile}>{tr('common_save')}</Button>
		</div>
	</Dialog>
{/if}

<svelte:head><title>{home?.organization.name ?? 'SPD'} · SPD</title></svelte:head>
