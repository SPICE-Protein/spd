<script lang="ts">
	import { goto } from '$app/navigation';
	import { researcherApplications, firstArray } from '$lib/api/client';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import Button from '$lib/components/Button.svelte';
	import ApiTokensPanel from '$lib/components/ApiTokensPanel.svelte';
	import FormFields from '$lib/components/FormFields.svelte';
	import type { FormField } from '$lib/components/form';
	import { buildSafe } from '$lib/components/form-values';

	$effect(() => {
		if (session.ready && !session.signedIn) goto('/');
	});

	let apps = $state<unknown[]>([]);
	async function loadApps() {
		try {
			const res = await researcherApplications.list();
			apps = firstArray(res, 'applications');
		} catch {
			apps = [];
		}
	}
	$effect(() => {
		if (session.signedIn) void loadApps();
	});

	const APP_FIELDS: FormField[] = [
		{ name: 'institutionName', required: true },
		{ name: 'department' },
		{ name: 'position' },
		{ name: 'institutionEmail' },
		{ name: 'organizationVerificationId', hint: tr('me_hint_org_vid') },
		{ name: 'researchPurpose', kind: 'textarea', required: true, rows: 4 }
	];
	let values = $state<Record<string, string>>({});
	let appError = $state('');
	let saving = $state(false);

	async function apply() {
		appError = '';
		const b = buildSafe(values, APP_FIELDS);
		if (b.error || !b.body) return (appError = b.error ?? tr('form_required_missing'));
		if (!b.body.institutionName || !b.body.researchPurpose) return (appError = tr('me_required_institution_purpose'));
		saving = true;
		try {
			const r = await researcherApplications.create(b.body as never);
			toastOk(tr('me_application_created'));
			appError = `${tr('me_channel')}: ${r.verification.channel} → ${r.verification.address ?? tr('me_channel_manual')} · ${r.verification.instructions}`;
			values = {};
			await loadApps();
		} catch (e) {
			appError = e instanceof Error ? e.message : String(e);
			toastErr(e);
		} finally {
			saving = false;
		}
	}
</script>

{#if session.signedIn}
	<div class="space-y-4">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div>
				<h1 class="text-2xl font-bold">{session.user?.displayName}</h1>
				<p class="mt-1 text-sm text-muted-foreground">
					<a class="underline font-mono" href={`https://orcid.org/${session.user?.orcidId}`} target="_blank" rel="noopener">{session.user?.orcidId}</a>
					· {session.user?.primaryEmail ?? '—'}
				</p>
			</div>
			<div class="flex gap-2">
				<Button size="sm" variant="ghost" href={`/users/${session.user?.id}`}>{tr('me_factor_link')}</Button>
				<Button size="sm" variant="ghost" onclick={async () => { await session.logoutAll(); goto('/'); }}>{tr('me_logout_all')}</Button>
				<Button size="sm" variant="ghost" onclick={async () => { await session.logout(); goto('/'); }}>{tr('nav_logout')}</Button>
			</div>
		</div>

		<Section title={tr('me_roles')}>
			<div class="flex flex-wrap gap-2">
				{#each session.roles as role (role.role)}
					<Badge tone={role.role === 'admin' ? 'bad' : role.role === 'curator' ? 'warn' : role.role === 'researcher' ? 'ok' : 'muted'}>
						{role.role}{#if role.expiresAt} · {fmtTime(role.expiresAt)}{/if}
					</Badge>
				{/each}
			</div>
			<p class="mt-2 text-xs text-muted-foreground">{tr('me_roles_note')}</p>
		</Section>

		<Section title={tr('me_quick_links')}>
			<div class="flex flex-wrap gap-2 text-sm">
				<Button size="sm" variant="outline" href="/my">{tr('nav_my')}</Button>
				<Button size="sm" variant="outline" href="/organizations">{tr('org_my_memberships')}</Button>
				<Button size="sm" variant="outline" href="/leaderboard">{tr('lb_title')}</Button>
			<Button size="sm" variant="outline" href="/validations">{tr('browse_validations')}</Button>
				<Button size="sm" variant="outline" href="/contributions">{tr('browse_contributions')}</Button>
				{#if session.canWrite}<Button size="sm" variant="outline" href="/submit/validation">{tr('submit_validation')}</Button>{/if}
			</div>
		</Section>

		<ApiTokensPanel />

		<Section title={tr('me_researcher_application')}>
			{#if session.canWrite}
				<p class="text-sm text-emerald-700 dark:text-emerald-300">{tr('me_already_researcher')}</p>
			{:else}
				{#if appError}<p class="mb-2 rounded-none bg-amber-50 dark:bg-amber-500/10 p-2 text-xs text-amber-900 dark:text-amber-200 whitespace-pre-line">{appError}</p>{/if}
				<FormFields fields={APP_FIELDS} bind:values columns={2} />
				<div class="mt-3 flex justify-end">
					<Button onclick={apply} disabled={saving}>{tr('me_submit_application')}</Button>
				</div>
			{/if}
		</Section>

		{#if apps.length}
			<Section title={tr('me_apps_recent')}>
				<ul class="divide-y text-sm">
					{#each apps as raw, i (String((raw as Record<string, unknown>).id ?? i))}
						{@const a = raw as Record<string, unknown>}
						<li class="flex items-center justify-between gap-2 py-1.5">
							<span class="font-mono text-xs">{String(a.id ?? '')}</span>
							<StatusBadge status={String(a.status ?? '')} ns="ap" />
							<span class="ml-auto text-xs text-muted-foreground">{fmtTime(Number(a.createdAt ?? 0))}</span>
						</li>
					{/each}
				</ul>
			</Section>
		{/if}
	</div>
{/if}

<svelte:head><title>{tr('nav_account')} · SPD</title></svelte:head>
