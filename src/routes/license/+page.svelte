<script lang="ts">
	import licenseText from '../../../LICENSE?raw';
	import { tr } from '$lib/i18n';
	import Section from '$lib/components/Section.svelte';
	import Button from '$lib/components/Button.svelte';

	const REPO = 'https://github.com/SPICE-Protein/spd';

	// The frontend license covers code, not the records it displays. Keeping
	// each source linked here makes that split visible without repeating the
	// per-record provenance already shown on detail pages.
	const SOURCES = [
		{ name: 'UniProt', href: 'https://www.uniprot.org/' },
		{ name: 'RCSB PDB', href: 'https://www.rcsb.org/' },
		{ name: 'NCBI', href: 'https://www.ncbi.nlm.nih.gov/' },
		{ name: 'Cellosaurus', href: 'https://www.cellosaurus.org/' },
		{ name: 'PubChem', href: 'https://pubchem.ncbi.nlm.nih.gov/' },
		{ name: 'Rhea', href: 'https://www.rhea-db.org/' },
		{ name: 'Reactome', href: 'https://reactome.org/' },
		{ name: 'BRENDA', href: 'https://www.brenda-enzymes.org/' }
	];
</script>

<div class="mx-auto max-w-3xl space-y-4">
	<h1 class="text-2xl font-bold">{tr('license_title')}</h1>
	<p class="text-sm leading-relaxed text-muted-foreground">{tr('license_intro')}</p>

	<Section title={tr('license_code_title')}>
		<p class="text-base font-semibold">{tr('license_code_heading')}</p>
		<p class="mt-2 text-sm leading-relaxed text-muted-foreground">{tr('license_code_body')}</p>
		<div class="mt-3 flex flex-wrap gap-2">
			<Button href={REPO} size="sm" variant="outline">{tr('license_source')}</Button>
			<Button href={`${REPO}/blob/main/LICENSE`} size="sm" variant="outline">
				{tr('license_read')}
			</Button>
		</div>

		<details class="mt-4 rounded-none border">
			<summary class="cursor-pointer select-none px-3 py-2 text-sm font-medium">
				{tr('license_full_text')}
			</summary>
			<pre
				class="max-h-96 overflow-auto border-t px-3 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">{licenseText}</pre>
		</details>
	</Section>

	<Section title={tr('license_data_title')}>
		<p class="text-sm leading-relaxed text-muted-foreground">{tr('license_data_body')}</p>
		<p class="mt-3 text-sm font-medium">{tr('license_sources_intro')}</p>
		<ul class="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
			{#each SOURCES as source (source.href)}
				<li>
					<a
						class="underline underline-offset-2 hover:text-foreground"
						href={source.href}
						target="_blank"
						rel="noreferrer">{source.name}</a
					>
				</li>
			{/each}
		</ul>
	</Section>

	<Section title={tr('license_third_party_title')}>
		<p class="text-sm leading-relaxed text-muted-foreground">
			{tr('license_third_party_body')}
		</p>
	</Section>

	<Section title={tr('license_attribution_title')}>
		<p class="text-sm leading-relaxed text-muted-foreground">
			{tr('license_attribution_body')}
		</p>
		<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
			{tr('license_questions')}
			<a
				class="underline underline-offset-2 hover:text-foreground"
				href={`${REPO}/issues`}
				target="_blank"
				rel="noreferrer">{tr('license_issues')}</a
			>
		</p>
	</Section>
</div>

<svelte:head><title>{tr('license_title')} · SPD</title></svelte:head>
