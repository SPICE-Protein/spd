<script lang="ts">
	import { organizations, firstArray } from '$lib/api/client';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import PageTools from '$lib/components/PageTools.svelte';

	// The public directory is the front door for everything organization-
	// related: profile pages and leader management live behind these links.
	let all = $state<Record<string, unknown>[]>([]);
	let dirLoading = $state(true);
	let mine = $state<unknown[]>([]);
	let loading = $state(false);

	async function loadDir() {
		dirLoading = true;
		try {
			const res = await organizations.directory();
			all = firstArray<Record<string, unknown>>(res, 'organizations');
		} catch {
			all = [];
		} finally {
			dirLoading = false;
		}
	}
	void loadDir();

	$effect(() => {
		if (session.signedIn) {
			void (async () => {
				loading = true;
				try {
					const res = await organizations.myMemberships();
					mine = firstArray(res, 'organizations');
				} catch {
					mine = [];
				} finally {
					loading = false;
				}
			})();
		}
	});
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="flex items-center gap-1.5 text-2xl font-bold">
			{tr('nav_organizations')}
			<InfoTip text={tr('org_page_intro')} label={`${tr('nav_organizations')} — ${tr('common_more_info')}`} class="mt-1" />
		</h1>
		<!-- visible to everyone: the wizard itself gates on sign-in, so the
		     entry point should never depend on having signed in first -->
		<PageTools withPrint={false} />
		<Button size="sm" href="/submit/organization">{tr('org_create_claim')}</Button>
	</div>
	<Section title={tr('org_dir_title')} hint={tr('org_dir_intro')}>
		{#if dirLoading}
			<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
		{:else if all.length === 0}
			<p class="text-sm text-muted-foreground">{tr('org_dir_empty')}</p>
		{:else}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each all as o (String(o.id))}
					<a
						href="/organizations/{String(o.id)}"
						class="rounded-none border p-4 transition-colors hover:border-primary/60 hover:bg-accent/30"
					>
						<h2 class="font-semibold">{String(o.name ?? '')}</h2>
						{#if o.department}<p class="mt-0.5 text-xs text-muted-foreground">
								{String(o.department)}
							</p>{/if}
						<div class="mt-2 flex flex-wrap gap-2 text-xs">
							<span>{tr('org_dir_members', { n: String(o.memberCount ?? 0) })}</span>
							{#if o.domain}<span class="break-words">{String(o.domain)}</span>{/if}
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</Section>

	{#if session.signedIn}
		<Section title={tr('org_my_memberships')}>
			{#if loading}<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
			{:else if mine.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
			{:else}
				<ul class="divide-y">
					{#each mine as raw, i (i)}
						{@const m = raw as Record<string, unknown>}
						<li class="flex flex-wrap items-center gap-3 py-2 text-sm">
							<a class="underline" href={`/organizations/${m.verificationId ?? m.organizationId}`}
								>{String(m.name ?? '')}</a
							>
							<code class="font-mono text-xs text-muted-foreground"
								>{String(m.verificationId ?? '')}</code
							>
							<Badge tone={m.role === 'leader' ? 'info' : 'muted'}>{String(m.role ?? '')}</Badge>
							<Badge tone={m.memberStatus === 'active' ? 'ok' : 'muted'}
								>{String(m.memberStatus ?? '')}</Badge
							>
						</li>
					{/each}
				</ul>
			{/if}
		</Section>
	{:else}
		<Section>
			<div class="flex flex-wrap items-center gap-3 text-sm">
				<p class="text-muted-foreground">{tr('org_login_for_memberships')}</p>
				<Button size="sm" onclick={() => session.signIn()}>{tr('nav_login')}</Button>
			</div>
			<p class="mt-3 text-xs text-muted-foreground">{tr('org_id_hint')}</p>
		</Section>
	{/if}
</div>

<svelte:head><title>{tr('nav_organizations')} · SPD</title></svelte:head>
