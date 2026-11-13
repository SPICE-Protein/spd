<script lang="ts">
	// The builder's edge vocabulary is precise but not how anyone thinks about
	// a question. This page starts from the question instead: search by
	// "structure", "validation", "lineage", then open the template in the
	// builder with your own root id.
	import { tr } from '$lib/i18n';
	import { QUERY_TEMPLATES, templateShape } from '$lib/graph/templates';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import Input from '$lib/components/Input.svelte';
	import Button from '$lib/components/Button.svelte';

	let q = $state('');

	const rows = $derived.by(() => {
		const needle = q.trim().toLowerCase();
		return QUERY_TEMPLATES.map((template) => ({
			template,
			shape: templateShape(template.build())
		})).filter(({ template }) => {
			if (!needle) return true;
			return [tr(template.titleKey), tr(template.descKey), ...template.keywords]
				.join(' ')
				.toLowerCase()
				.includes(needle);
		});
	});
</script>

<div class="mx-auto max-w-3xl space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="flex items-center gap-1.5 text-2xl font-bold">
			{tr('query_templates_title')}
			<InfoTip
				text={tr('query_templates_hint')}
				label={`${tr('query_templates_title')} — ${tr('common_more_info')}`}
				class="mt-1"
			/>
		</h1>
		<Button size="sm" variant="outline" href="/query">← {tr('query_title')}</Button>
	</div>

	<Section>
		<label class="block">
			<span class="mb-1 block text-xs text-muted-foreground">
				{tr('query_templates_search')}
			</span>
			<Input
				name="query_template_search"
				type="search"
				bind:value={q}
				placeholder={tr('query_templates_search_ph')}
				aria_label={tr('query_templates_search')}
			/>
		</label>

		{#if rows.length === 0}
			<p class="mt-3 text-sm text-muted-foreground">{tr('query_templates_empty', { q })}</p>
		{:else}
			<ul class="mt-3 divide-y border">
				{#each rows as { template, shape } (template.id)}
					<li class="p-3">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div class="min-w-0">
								<a
									class="font-semibold underline-offset-4 hover:underline"
									href={`/query?template=${template.id}`}>{tr(template.titleKey)}</a
								>
								<p class="mt-1 text-xs text-muted-foreground">{tr(template.descKey)}</p>
								<p class="mt-1 break-words font-mono text-[11px] text-muted-foreground">
									{shape}
								</p>
							</div>
							<Button size="xs" variant="outline" href={`/query?template=${template.id}`}
								>{tr('query_template_use')}</Button
							>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Section>
</div>

<svelte:head><title>{tr('query_templates_title')} · SPD</title></svelte:head>
