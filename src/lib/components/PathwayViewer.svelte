<script lang="ts">
	import type {
		PathwayTopology,
		PathwayTopologyEntity,
		PathwayTopologyReaction
	} from '$lib/api/types';
	import { tr } from '$lib/i18n';
	import { mode } from 'mode-watcher';
	import Button from './Button.svelte';

	/**
	 * SPD-owned pathway diagram.
	 *
	 * The topology is a plain graph: compartments, entities and reactions.
	 * Instead of hand-placing nodes, the graph is handed to Mermaid's dagre
	 * layout: reactants → reaction → products, modifiers dashed into the
	 * reaction. Mermaid breaks cycles and routes edges, so a pathway that never
	 * came from Reactome renders the same way and curated edits stay readable.
	 */
	let { topology }: { topology: PathwayTopology } = $props();

	const COMPARTMENT_COLORS = [
		'#2563eb',
		'#059669',
		'#d97706',
		'#7c3aed',
		'#dc2626',
		'#0891b2',
		'#65a30d',
		'#c026d3'
	];

	const entityById = $derived(new Map(topology.entities.map((entity) => [entity.id, entity])));
	const reactionById = $derived(
		new Map(topology.reactions.map((reaction) => [reaction.id, reaction]))
	);
	const compartmentIndex = $derived(
		new Map(topology.compartments.map((compartment, index) => [compartment.id, index]))
	);
	const compartmentName = $derived(
		new Map(topology.compartments.map((compartment) => [compartment.id, compartment.name]))
	);

	// Keys are `e:<entity id>` / `r:<reaction id>`.
	let selected = $state<string | null>(null);
	const selectedEntity = $derived(
		selected?.startsWith('e:') ? (entityById.get(selected.slice(2)) ?? null) : null
	);
	const selectedReaction = $derived(
		selected?.startsWith('r:') ? (reactionById.get(selected.slice(2)) ?? null) : null
	);
	const selectedCompartment = $derived.by(() => {
		const id = selectedEntity?.compartment ?? selectedReaction?.compartment;
		return id ? (compartmentName.get(id) ?? id) : '';
	});
	const selectedReactionEntityNames = $derived.by(() => {
		if (!selectedReaction) return { reactants: [], products: [], modifiers: [] };
		const nameOf = (id: string) => entityById.get(id)?.name ?? id;
		return {
			reactants: selectedReaction.reactants.map((participant) => ({
				name: nameOf(participant.entity),
				stoichiometry: participant.stoichiometry
			})),
			products: selectedReaction.products.map((participant) => ({
				name: nameOf(participant.entity),
				stoichiometry: participant.stoichiometry
			})),
			modifiers: selectedReaction.modifiers.map((modifier) => ({
				name: nameOf(modifier.entity),
				role: modifier.role
			}))
		};
	});

	// ---- render -------------------------------------------------------------
	let host = $state<HTMLDivElement>();
	let renderError = $state('');
	let zoom = $state(1);
	let colorByCompartment = $derived(
		new Map(
			topology.compartments.map((compartment, index) => [
				compartment.id,
				COMPARTMENT_COLORS[index % COMPARTMENT_COLORS.length]
			])
		)
	);

	const usedCompartments = $derived(
		topology.compartments.filter((compartment) =>
			topology.entities.some((entity) => entity.compartment === compartment.id)
		)
	);

	/** Plain-text labels: escape markup, then add our own line breaks. */
	function escapeLabel(value: string): string {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function wrap(value: string, max: number, maxLines = 2): string {
		const words = value.trim().split(/\s+/).filter(Boolean);
		const lines: string[] = [];
		let line = '';
		for (const word of words) {
			const next = line ? `${line} ${word}` : word;
			if (line && next.length > max) {
				lines.push(line);
				line = word;
				if (lines.length === maxLines - 1) break;
			} else {
				line = next;
			}
		}
		if (line) lines.push(line);
		if (lines.length > maxLines) lines.length = maxLines;
		if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
			lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(1, max - 1))}…`;
		}
		return lines.map(escapeLabel).join('<br/>');
	}

	function entityLabel(entity: PathwayTopologyEntity): string {
		// Reactome appends the compartment to the species name; the diagram
		// already encodes it as colour, so drop the bracket for the node.
		const name = entity.name.replace(/\s*\[[^\]]*\]\s*$/, '').trim() || entity.id;
		return wrap(name, 26);
	}

	function reactionLabel(reaction: PathwayTopologyReaction): string {
		const name = reaction.name.trim();
		return name ? wrap(name, 24) : '→';
	}

	let renderSeq = 0;
	let mermaidModule: Promise<typeof import('mermaid').default> | null = null;

	function loadMermaid(): Promise<typeof import('mermaid').default> {
		mermaidModule ??= import('mermaid').then((module) => module.default);
		return mermaidModule;
	}

	$effect(() => {
		const topo = topology;
		const target = host;
		const dark = mode.current === 'dark';
		if (!target) return;
		const seq = ++renderSeq;
		void renderDiagram(topo, dark, target, seq);
	});

	async function renderDiagram(
		topo: PathwayTopology,
		dark: boolean,
		target: HTMLDivElement,
		seq: number
	) {
		renderError = '';
		try {
			const mermaid = await loadMermaid();
			if (seq !== renderSeq) return;

			const fontFamily =
				typeof window !== 'undefined'
					? getComputedStyle(document.body).fontFamily
					: 'ui-sans-serif, system-ui, sans-serif';
			mermaid.initialize({
				startOnLoad: false,
				securityLevel: 'strict',
				theme: 'base',
				fontFamily,
				flowchart: {
					htmlLabels: true,
					curve: 'basis',
					nodeSpacing: 30,
					rankSpacing: 48,
					padding: 12,
					useMaxWidth: false
				},
				themeVariables: {
					darkMode: dark,
					background: 'transparent',
					fontFamily,
					fontSize: '13px',
					lineColor: dark ? '#64748b' : '#94a3b8',
					textColor: dark ? '#e2e8f0' : '#0f172a',
					mainBkg: dark ? '#0f172a' : '#ffffff',
					nodeBorder: dark ? '#475569' : '#cbd5e1',
					edgeLabelBackground: dark ? '#0b1120' : '#ffffff'
				}
			});

			const { source, nodeKeyById } = buildSource(topo, dark);
			const { svg } = await mermaid.render(`pathway_diagram_${seq}`, source);
			if (seq !== renderSeq || !target.isConnected) return;

			target.innerHTML = svg;
			const element = target.querySelector('svg');
			if (!element) throw new Error('mermaid returned no svg');
			element.style.width = '100%';
			element.style.height = 'auto';
			element.style.maxWidth = 'none';
			element.style.display = 'block';
			element.setAttribute('role', 'img');
			element.setAttribute('aria-label', topo.name);

			for (const node of element.querySelectorAll<SVGGElement>('g.node')) {
				const nodeId =
					node.getAttribute('data-id') ?? node.id.replace(/^flowchart-/, '').replace(/-\d+$/, '');
				const key = nodeKeyById.get(nodeId);
				if (!key) continue;
				node.dataset.pwKey = key;
				node.setAttribute('role', 'button');
				node.setAttribute('tabindex', '0');
				node.style.cursor = 'pointer';
				node.addEventListener('click', () => select(key));
				node.addEventListener('keydown', (event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						select(key);
					}
				});
			}
			applySelection();
		} catch (error) {
			if (seq !== renderSeq) return;
			renderError = error instanceof Error ? error.message : String(error);
		}
	}

	function buildSource(topo: PathwayTopology, dark: boolean) {
		const lines = ['flowchart TD'];
		const nodeKeyById = new Map<string, string>();
		const compartmentClass = new Map<string, string>();
		const tint = dark ? '26' : '14';
		const labelColor = dark ? '#e2e8f0' : '#0f172a';

		topo.compartments.forEach((compartment, index) => {
			const color = COMPARTMENT_COLORS[index % COMPARTMENT_COLORS.length];
			const className = `comp${index}`;
			compartmentClass.set(compartment.id, className);
			lines.push(
				`  classDef ${className} fill:${color}${tint},stroke:${color},color:${labelColor},stroke-width:1px;`
			);
		});
		lines.push(
			`  classDef reactionNode fill:${dark ? '#111827' : '#f8fafc'},stroke:${dark ? '#64748b' : '#94a3b8'},color:${labelColor},stroke-width:1px;`
		);

		const entityNodeId = new Map<string, string>();
		topo.entities.forEach((entity, index) => {
			const id = `e${index}`;
			const className = compartmentClass.get(entity.compartment);
			entityNodeId.set(entity.id, id);
			nodeKeyById.set(id, `e:${entity.id}`);
			lines.push(`  ${id}["${entityLabel(entity)}"]${className ? `:::${className}` : ''}`);
		});

		const reactionNodeId = new Map<string, string>();
		topo.reactions.forEach((reaction, index) => {
			const id = `r${index}`;
			reactionNodeId.set(reaction.id, id);
			nodeKeyById.set(id, `r:${reaction.id}`);
			lines.push(`  ${id}(["${reactionLabel(reaction)}"]):::reactionNode`);
		});

		const seen = new Set<string>();
		const edge = (from: string, to: string, dashed: boolean) => {
			const key = `${from}->${to}:${dashed}`;
			if (seen.has(key)) return;
			seen.add(key);
			lines.push(`  ${from} ${dashed ? '-.->' : '-->'} ${to}`);
		};
		for (const reaction of topo.reactions) {
			const reactionId = reactionNodeId.get(reaction.id);
			if (!reactionId) continue;
			for (const participant of reaction.reactants) {
				const entityId = entityNodeId.get(participant.entity);
				if (entityId) edge(entityId, reactionId, false);
			}
			for (const participant of reaction.products) {
				const entityId = entityNodeId.get(participant.entity);
				if (entityId) edge(reactionId, entityId, false);
			}
			for (const modifier of reaction.modifiers) {
				const entityId = entityNodeId.get(modifier.entity);
				if (entityId) edge(entityId, reactionId, true);
			}
		}
		return { source: lines.join('\n'), nodeKeyById };
	}

	// ---- interaction --------------------------------------------------------
	function select(key: string) {
		selected = selected === key ? null : key;
		applySelection();
	}

	function applySelection() {
		if (!host) return;
		for (const node of host.querySelectorAll<SVGGElement>('g.node[data-pw-key]')) {
			const key = node.dataset.pwKey;
			node.classList.toggle('pw-selected', key === selected);
			node.classList.toggle('pw-dimmed', selected != null && key !== selected);
		}
	}

	function zoomBy(factor: number) {
		zoom = Math.min(6, Math.max(0.4, Number((zoom * factor).toFixed(2))));
	}
</script>

<div class="space-y-2">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<p class="text-xs text-muted-foreground">{tr('pathway_diagram_hint')}</p>
		<div class="flex items-center gap-1">
			<Button size="xs" variant="outline" onclick={() => zoomBy(1.25)}
				>{tr('pathway_diagram_zoom_in')}</Button
			>
			<Button size="xs" variant="outline" onclick={() => zoomBy(0.8)}
				>{tr('pathway_diagram_zoom_out')}</Button
			>
			<Button size="xs" variant="ghost" onclick={() => (zoom = 1)}
				>{tr('pathway_diagram_fit')}</Button
			>
		</div>
	</div>

	{#if renderError}
		<div class="border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
			{tr('pathway_diagram_render_error')}: {renderError}
		</div>
	{/if}

	<div class="pathway-mermaid max-h-[72vh] overflow-auto border bg-muted/20">
		<div bind:this={host} style={`width:${zoom * 100}%`}></div>
	</div>

	{#if usedCompartments.length}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
			<span>{tr('pathway_diagram_compartments')}</span>
			{#each usedCompartments as compartment (compartment.id)}
				<span class="inline-flex items-center gap-1.5">
					<span
						class="inline-block size-2.5"
						style={`background:${colorByCompartment.get(compartment.id)}`}
					></span>
					{compartment.name || compartment.id}
				</span>
			{/each}
		</div>
	{/if}

	{#if selectedEntity}
		<div class="border bg-background p-3 text-sm">
			<div class="flex flex-wrap items-baseline gap-2">
				<span class="font-semibold">{selectedEntity.name}</span>
				<span class="text-xs text-muted-foreground">{selectedCompartment}</span>
			</div>
			<dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
				{#if selectedEntity.entityType}
					<dt class="text-muted-foreground">{tr('pathway_diagram_entity')}</dt>
					<dd>{selectedEntity.entityType}</dd>
				{/if}
			</dl>
		</div>
	{:else if selectedReaction}
		<div class="border bg-background p-3 text-sm">
			<div class="flex flex-wrap items-baseline gap-2">
				<span class="font-semibold">{selectedReaction.name}</span>
				<span class="text-xs text-muted-foreground">{selectedCompartment}</span>
			</div>
			<dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
				{#if selectedReaction.equation}
					<dt class="text-muted-foreground">{tr('pathway_diagram_equation')}</dt>
					<dd class="font-mono break-words">{selectedReaction.equation}</dd>
				{/if}
				{#if selectedReaction.description}
					<dt class="text-muted-foreground">{tr('common_details')}</dt>
					<dd class="whitespace-pre-line break-words">{selectedReaction.description}</dd>
				{/if}
				{#if selectedReactionEntityNames.reactants.length}
					<dt class="text-muted-foreground">{tr('pathway_diagram_reactants')}</dt>
					<dd class="break-words">
						{selectedReactionEntityNames.reactants
							.map(
								(item) => `${item.stoichiometry > 1 ? `${item.stoichiometry} ` : ''}${item.name}`
							)
							.join(' · ')}
					</dd>
				{/if}
				{#if selectedReactionEntityNames.products.length}
					<dt class="text-muted-foreground">{tr('pathway_diagram_products')}</dt>
					<dd class="break-words">
						{selectedReactionEntityNames.products
							.map(
								(item) => `${item.stoichiometry > 1 ? `${item.stoichiometry} ` : ''}${item.name}`
							)
							.join(' · ')}
					</dd>
				{/if}
				{#if selectedReactionEntityNames.modifiers.length}
					<dt class="text-muted-foreground">{tr('pathway_diagram_modifiers')}</dt>
					<dd class="break-words">
						{selectedReactionEntityNames.modifiers
							.map((item) => `${item.name} (${item.role})`)
							.join(' · ')}
					</dd>
				{/if}
				{#if selectedReaction.pubmed.length}
					<dt class="text-muted-foreground">{tr('pathway_diagram_pubmed')}</dt>
					<dd class="flex flex-wrap gap-2">
						{#each selectedReaction.pubmed as pmid (pmid)}
							<a
								class="font-mono underline"
								href={`https://pubmed.ncbi.nlm.nih.gov/${pmid}`}
								target="_blank"
								rel="noreferrer">{pmid}</a
							>
						{/each}
					</dd>
				{/if}
			</dl>
		</div>
	{/if}
</div>

<style>
	.pathway-mermaid :global(g.node) {
		cursor: pointer;
		transition: opacity 0.15s ease;
	}
	.pathway-mermaid :global(g.node.pw-selected) {
		filter: drop-shadow(0 0 5px var(--primary));
	}
	.pathway-mermaid :global(g.node.pw-dimmed) {
		opacity: 0.45;
	}
	.pathway-mermaid :global(g.node .label) {
		line-height: 1.3;
	}
</style>
