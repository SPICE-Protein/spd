<script lang="ts">
	import { tr } from '$lib/i18n';
	import { session } from '$lib/state/session.svelte';
	import Section from '$lib/components/Section.svelte';
	import Button from '$lib/components/Button.svelte';
	import { SUBMITTABLE } from '$lib/submit/registry';

	// The fold wizard now carries the whole prediction chain (protein → sequence
	// → fold) the way the GUI publishes, so the homepage leads with chains and
	// the single-record wizards sink to a supplementary section.
	// New registry kind = one card in its group section — no third place.
	const chains = [
		{ href: '/submit/fold', key: 'submit_fold', descKey: 'submit_fold_desc' },
		{ href: '/submit/validation', key: 'submit_validation', descKey: 'submit_validation_desc' },
		{ href: '/submit/design', key: 'submit_design', descKey: 'submit_design_desc' }
	];
	const singles = [
		{
			href: '/submit/species-data',
			key: 'submit_species_data',
			descKey: 'submit_species_data_desc'
		},
		{ href: '/submit/protein', key: 'submit_protein', descKey: 'submit_protein_desc' },
		{ href: '/submit/sequence', key: 'submit_sequence', descKey: 'submit_sequence_desc' },
		{ href: '/submit/codon-usage', key: 'submit_codon', descKey: 'submit_codon_desc' },
		{ href: '/submit/import', key: 'import_title', descKey: 'import_intro' },
		{
			href: '/submit/organization',
			key: 'submit_organization',
			descKey: 'submit_organization_desc'
		}
	];

	const GROUPS = ['wetlab', 'design', 'analysis', 'community'] as const;
	const byGroup = $derived(
		GROUPS.map((g) => ({ g, entries: SUBMITTABLE.filter((c) => c.group === g) }))
	);
</script>

<div class="space-y-4">
	<h1 class="text-2xl font-bold">{tr('nav_submit')}</h1>
	<p class="max-w-3xl text-sm text-muted-foreground">{tr('submit_intro')}</p>

	{#if !session.signedIn}
		<div
			class="flex items-center gap-3 rounded-none border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200"
		>
			{tr('submit_login_needed')}
			<Button size="sm" onclick={() => session.signIn()}>{tr('nav_login')}</Button>
		</div>
	{:else if !session.canWrite}
		<div
			class="flex flex-wrap items-center gap-3 rounded-none border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200"
		>
			{tr('submit_researcher_needed')}
			<Button size="sm" href="/me">{tr('nav_account')}</Button>
		</div>
	{/if}

	{#if session.canWrite}
	<Section title={tr('submit_core_title')}>
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each chains as c (c.href)}
				<a
					href={c.href}
					class="rounded-none border p-4 transition-colors hover:border-primary/60 hover:bg-accent/30"
				>
					<h2 class="font-semibold">{tr(c.key)}</h2>
					<p class="mt-1 text-xs text-muted-foreground">{tr(c.descKey)}</p>
				</a>
			{/each}
		</div>
	</Section>

	<Section title={tr('submit_singles_title')}>
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{#each singles as c (c.href)}
				<a
					href={c.href}
					class="rounded-none border p-4 transition-colors hover:border-primary/60 hover:bg-accent/30"
				>
					<h2 class="font-semibold">{tr(c.key)}</h2>
					<p class="mt-1 text-xs text-muted-foreground">{tr(c.descKey)}</p>
				</a>
			{/each}
		</div>
	</Section>

	{#each byGroup as grp (grp.g)}
		{#if grp.entries.length}
			<Section title={tr(`submit_group_${grp.g}`)}>
				<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{#each grp.entries as e (e.slug)}
						<a
							href="/submit/{e.slug}"
							class="rounded-none border p-4 transition-colors hover:border-primary/60 hover:bg-accent/30"
						>
							<h2 class="font-semibold">{tr(e.titleKey)}</h2>
							<p class="mt-1 text-xs text-muted-foreground">{tr(e.descKey)}</p>
						</a>
					{/each}
				</div>
			</Section>
		{/if}
	{/each}

	<p class="max-w-3xl text-xs text-muted-foreground">{tr('submit_browse_only_note')}</p>
	{/if}
</div>

<svelte:head><title>{tr('nav_submit')} · SPD</title></svelte:head>
