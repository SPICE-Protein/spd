<script lang="ts">
	import { schema } from '$lib/api/client';
	import { SpdApiError } from '$lib/api/base';
	import { tr } from '$lib/i18n';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import JsonBlock from '$lib/components/JsonBlock.svelte';
	import Button from '$lib/components/Button.svelte';
	import Select from '$lib/components/Select.svelte'

	// Entity type names as the API resolves them (api-style, e.g. fold → predicted-fold).
	const TYPES = [
		'protein',
		'gene',
		'gene_region',
		'sequence',
		'environment',
		'model',
		'fold',
		'predicted-fold',
		'validation',
		'wet_lab_validation',
		'artifact',
		'review',
		'organization',
		'researcher_application',
		'vector',
		'cassette',
		'construct',
		'codon_usage',
		'mutation_set',
		'mutation_effect',
		'measurement',
		'interaction',
		'family',
		'comparison',
		'protocol',
		'wiki',
		'reference',
		'restriction_enzyme',
		'biobrick_part',
		'enzyme',
		'enzyme_reaction',
		'pathway',
		'strain',
		'cell_line',
		'material_link',
		'media_recipe',
		'condition_template',
		'reagent',
		'record',
		'api_record'
	];

	let selected = $state('fold');
	let doc = $state<Record<string, unknown> | null>(null);
	let loading = $state(false);
	let error = $state('');

	async function loadSchema() {
		loading = true;
		error = '';
		try {
			doc = await schema.get(selected);
		} catch (e) {
			doc = null;
			error = e instanceof SpdApiError ? `${e.code}: ${e.message}` : String(e);
		} finally {
			loading = false;
		}
	}
	$effect(() => {
		if (selected) void loadSchema();
	});

	const options = TYPES;
</script>

<div class="mx-auto max-w-3xl space-y-4">
	<div>
		<h1 class="flex items-center gap-1.5 text-2xl font-bold">
			{tr('schema_title')}
			<InfoTip text={tr('schema_intro')} label={`${tr('schema_title')} — ${tr('common_more_info')}`} class="mt-1" />
		</h1>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<Select name="schema_type" class="h-9 min-w-48" bind:value={selected} options={options.map((t) => ({ value: t, label: t }))} onchange={loadSchema} />
		<Button size="sm" variant="outline" onclick={loadSchema} disabled={loading}>{tr('common_reload')}</Button>
		<a class="text-xs underline text-muted-foreground" href="/openapi.json" target="_blank" rel="noreferrer">openapi.json</a>
	</div>

	{#if error}
		<div class="rounded-none border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
	{:else if loading || !doc}
		<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else}
		<Section title={tr('schema_for', { type: selected })}>
			{#if doc.jsonSchema != null}
				<JsonBlock label="jsonSchema" value={doc.jsonSchema} open />
			{:else}
				<JsonBlock label="schema" value={doc} open />
			{/if}
		</Section>
	{/if}
</div>

<svelte:head><title>{tr('schema_title')} · SPD</title></svelte:head>
