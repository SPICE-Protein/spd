<script lang="ts">
	import type {
		PathwayTopology,
		PathwayTopologyEntity,
		PathwayTopologyReaction
	} from '$lib/api/types';
	import { tr } from '$lib/i18n';
	import { theme } from '$lib/state/theme.svelte';
	import { tick } from 'svelte';
	import Button from './Button.svelte';
	import ExportMenu from './ExportMenu.svelte';
	import InfoTip from './InfoTip.svelte';
	import { fileStem } from '$lib/export/bio';
	import type { ExportFormat } from '$lib/export/types';
	import { compartmentPaint, compartmentSwatch, reactionPaint } from '$lib/pathway/palette';

	/**
	 * SPD-owned pathway diagram.
	 *
	 * The topology is a plain graph: compartments, entities and reactions.
	 * Instead of hand-placing nodes, the graph is handed to Mermaid's dagre
	 * layout: reactants → reaction → products, modifiers dashed into the
	 * reaction. Mermaid breaks cycles and routes edges, so a pathway that never
	 * came from Reactome renders the same way and curated edits stay readable.
	 *
	 * Mermaid's own theme is not used for node colour: it paints first and the
	 * palette is applied afterwards (see `paintDiagram`), so a compartment's
	 * hue and its label's contrast are decided in one place.
	 */
	let { topology }: { topology: PathwayTopology } = $props();

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
	let scroller = $state<HTMLDivElement>();
	let minimap = $state<HTMLCanvasElement>();
	let svgEl: SVGSVGElement | null = null;
	let renderError = $state('');
	let zoom = $state(1);
	let contentBox = $state({ x: 0, y: 0, width: 0, height: 0 });
	let showMinimap = $state(false);
	let panning = $state(false);

	const dark = $derived(theme.effective === 'dark');
	const zoomPercent = $derived(Math.round(zoom * 100));

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
		const themeDark = dark;
		if (!target) return;
		const seq = ++renderSeq;
		void renderDiagram(topo, themeDark, target, seq);
	});

	async function renderDiagram(
		topo: PathwayTopology,
		themeDark: boolean,
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
				// Mermaid stops at 500 edges by default. A Reactome pathway with
				// its entities and reactions draws more than that (HIV Infection:
				// 160 reactions, 567 links), so the ceiling is raised; it stays a
				// guard against a pathological import, not a readability setting.
				maxEdges: 5000,
				// SVG text rather than foreignObject: an exported image has to be
				// self-contained, and HTML labels do not rasterise into a PNG.
				htmlLabels: false,
				flowchart: {
					curve: 'basis',
					nodeSpacing: 30,
					rankSpacing: 48,
					padding: 12,
					useMaxWidth: false
				},
				themeVariables: {
					darkMode: themeDark,
					background: 'transparent',
					fontFamily,
					fontSize: '13px',
					lineColor: themeDark ? '#64748b' : '#94a3b8',
					textColor: themeDark ? '#e2e8f0' : '#0f172a',
					mainBkg: themeDark ? '#0f172a' : '#ffffff',
					nodeBorder: themeDark ? '#475569' : '#cbd5e1',
					edgeLabelBackground: themeDark ? '#0b1120' : '#ffffff'
				}
			});

			const { source, nodeKeyById } = buildSource(topo);
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
			svgEl = element;

			for (const node of element.querySelectorAll<SVGGElement>('g.node')) {
				// Mermaid's element id is `<render id>-flowchart-<node id>-<n>`.
				const raw =
					node.getAttribute('data-id') ?? node.id.split('flowchart-').pop() ?? node.id;
				const nodeId = raw.replace(/-\d+$/, '');
				const key = nodeKeyById.get(nodeId);
				if (!key) continue;
				node.dataset.pwKey = key;
				node.setAttribute('role', 'button');
				node.setAttribute('tabindex', '0');
				node.style.cursor = 'pointer';
				node.addEventListener('click', () => {
					// A drag that crossed a node must not also select it.
					if (suppressClick) {
						suppressClick = false;
						return;
					}
					select(key);
				});
				node.addEventListener('keydown', (event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						select(key);
					}
				});
			}
			paintDiagram(element, themeDark);
			applySelection();
			await tick();
			measure();
		} catch (error) {
			if (seq !== renderSeq) return;
			renderError = error instanceof Error ? error.message : String(error);
		}
	}

	function buildSource(topo: PathwayTopology) {
		const lines = ['flowchart TD'];
		const nodeKeyById = new Map<string, string>();

		const entityNodeId = new Map<string, string>();
		topo.entities.forEach((entity, index) => {
			const id = `e${index}`;
			entityNodeId.set(entity.id, id);
			nodeKeyById.set(id, `e:${entity.id}`);
			lines.push(`  ${id}["${entityLabel(entity)}"]`);
		});

		const reactionNodeId = new Map<string, string>();
		topo.reactions.forEach((reaction, index) => {
			const id = `r${index}`;
			reactionNodeId.set(reaction.id, id);
			nodeKeyById.set(id, `r:${reaction.id}`);
			lines.push(`  ${id}(["${reactionLabel(reaction)}"])`);
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

	/**
	 * Apply the palette after mermaid has drawn. Doing it here rather than in
	 * `classDef` means the fill, the outline and the label colour are decided
	 * together, and a label never ends up inheriting the theme's text colour
	 * over a fill that came from somewhere else.
	 */
	function paintDiagram(svg: SVGSVGElement, themeDark: boolean) {
		const edgeColor = themeDark ? '#64748b' : '#94a3b8';
		for (const node of svg.querySelectorAll<SVGGElement>('g.node')) {
			const key = node.dataset.pwKey;
			if (!key) continue;
			const entity = key.startsWith('e:') ? entityById.get(key.slice(2)) : null;
			const paint = entity
				? compartmentPaint(compartmentIndex.get(entity.compartment) ?? 0, themeDark)
				: reactionPaint(themeDark);
			for (const shape of node.querySelectorAll<SVGElement>('rect, path, polygon, circle, ellipse')) {
				shape.style.fill = paint.fill;
				shape.style.stroke = paint.stroke;
				shape.style.strokeWidth = '1.25px';
			}
			for (const label of node.querySelectorAll<SVGElement>('.nodeLabel, .label, text')) {
				label.style.fill = paint.text;
				label.style.color = paint.text;
			}
		}
		for (const path of svg.querySelectorAll<SVGElement>('.edgePath path, .flowchart-link')) {
			path.style.stroke = edgeColor;
		}
		for (const marker of svg.querySelectorAll<SVGElement>('marker path')) {
			marker.style.fill = edgeColor;
		}
	}

	// ---- viewport ------------------------------------------------------------
	let nodeBoxes: { x: number; y: number; w: number; h: number; color: string }[] = [];
	let mini = { scale: 1, ox: 0, oy: 0 };
	let suppressClick = false;
	let dragFrom: { x: number; y: number; left: number; top: number; moved: boolean } | null = null;

	/** Screen pixels per SVG user unit at the current zoom. */
	function unitScale(): number {
		if (!svgEl || !contentBox.width) return 1;
		return svgEl.getBoundingClientRect().width / contentBox.width;
	}

	function visibleBox() {
		const scale = unitScale();
		return {
			x: contentBox.x + (scroller?.scrollLeft ?? 0) / scale,
			y: contentBox.y + (scroller?.scrollTop ?? 0) / scale,
			w: (scroller?.clientWidth ?? 0) / scale,
			h: (scroller?.clientHeight ?? 0) / scale
		};
	}

	function measure() {
		if (!svgEl || !scroller) return;
		const viewBox = svgEl.viewBox?.baseVal;
		const box =
			viewBox && viewBox.width > 0
				? { x: viewBox.x, y: viewBox.y, width: viewBox.width, height: viewBox.height }
				: (() => {
						const b = svgEl.getBBox();
						return { x: b.x, y: b.y, width: b.width, height: b.height };
					})();
		contentBox = box;
		const onset = { width: box.width * zoom, height: box.height * zoom };
		nodeBoxes = [];
		for (const node of svgEl.querySelectorAll<SVGGElement>('g.node[data-pw-key]')) {
			const key = node.dataset.pwKey ?? '';
			const entity = key.startsWith('e:') ? entityById.get(key.slice(2)) : null;
			const paint = entity
				? compartmentPaint(compartmentIndex.get(entity.compartment) ?? 0, dark)
				: reactionPaint(dark);
			const b = node.getBBox();
			nodeBoxes.push({ x: b.x, y: b.y, w: b.width, h: b.height, color: paint.stroke });
		}
		showMinimap =
			(onset.width > scroller.clientWidth + 8 || onset.height > scroller.clientHeight + 8) &&
			nodeBoxes.length > 0;
		if (showMinimap) {
			void tick().then(drawMinimap);
		}
	}

	function drawMinimap() {
		const canvas = minimap;
		if (!canvas || !contentBox.width || !contentBox.height) return;
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (!width || !height) return;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);

		const pad = 4;
		const scale = Math.min(
			(width - pad * 2) / contentBox.width,
			(height - pad * 2) / contentBox.height
		);
		const ox = pad + (width - pad * 2 - contentBox.width * scale) / 2;
		const oy = pad + (height - pad * 2 - contentBox.height * scale) / 2;
		mini = { scale, ox, oy };

		ctx.fillStyle = dark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.08)';
		ctx.fillRect(0, 0, width, height);
		for (const box of nodeBoxes) {
			ctx.fillStyle = box.color;
			ctx.fillRect(
				ox + (box.x - contentBox.x) * scale,
				oy + (box.y - contentBox.y) * scale,
				Math.max(1, box.w * scale),
				Math.max(1, box.h * scale)
			);
		}
		const view = visibleBox();
		ctx.strokeStyle = dark ? 'rgba(226, 232, 240, 0.85)' : 'rgba(15, 23, 42, 0.7)';
		ctx.lineWidth = 1;
		ctx.strokeRect(
			ox + (view.x - contentBox.x) * scale,
			oy + (view.y - contentBox.y) * scale,
			view.w * scale,
			view.h * scale
		);
	}

	function jumpTo(event: PointerEvent) {
		const canvas = minimap;
		if (!canvas || !scroller) return;
		const rect = canvas.getBoundingClientRect();
		const x = (event.clientX - rect.left - mini.ox) / mini.scale + contentBox.x;
		const y = (event.clientY - rect.top - mini.oy) / mini.scale + contentBox.y;
		const scale = unitScale();
		scroller.scrollLeft = (x - contentBox.x) * scale - scroller.clientWidth / 2;
		scroller.scrollTop = (y - contentBox.y) * scale - scroller.clientHeight / 2;
		drawMinimap();
	}

	function zoomAt(factor: number, clientX?: number, clientY?: number) {
		const next = Math.min(5, Math.max(0.02, Number((zoom * factor).toFixed(3))));
		if (next === zoom) return;
		const box = scroller;
		if (!box) {
			zoom = next;
			return;
		}
		const rect = box.getBoundingClientRect();
		const anchorX = clientX ?? rect.left + box.clientWidth / 2;
		const anchorY = clientY ?? rect.top + box.clientHeight / 2;
		const fx = (box.scrollLeft + (anchorX - rect.left)) / Math.max(1, box.scrollWidth);
		const fy = (box.scrollTop + (anchorY - rect.top)) / Math.max(1, box.scrollHeight);
		zoom = next;
		void tick().then(() => {
			box.scrollLeft = fx * box.scrollWidth - (anchorX - rect.left);
			box.scrollTop = fy * box.scrollHeight - (anchorY - rect.top);
			void tick().then(() => {
				measure();
			});
		});
	}

	function resetZoom() {
		zoom = 1;
		void tick().then(() => measure());
	}

	/** Shrink until the whole diagram is on screen; never enlarge past 1:1. */
	function fitToView() {
		const box = scroller;
		if (!box || !contentBox.width) return;
		const pad = 16;
		const next = Math.min(
			(box.clientWidth - pad) / contentBox.width,
			(box.clientHeight - pad) / contentBox.height,
			1
		);
		zoom = Math.max(0.02, Number(next.toFixed(3)));
		void tick().then(() => {
			box.scrollLeft = 0;
			box.scrollTop = 0;
			measure();
		});
	}

	// Native listeners: the wheel handler has to preventDefault, which a
	// passive listener cannot do.
	$effect(() => {
		const box = scroller;
		if (!box) return;
		const onWheel = (event: WheelEvent) => {
			if (!(event.ctrlKey || event.metaKey)) return;
			event.preventDefault();
			zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX, event.clientY);
		};
		const onScroll = () => {
			if (showMinimap) drawMinimap();
		};
		box.addEventListener('wheel', onWheel, { passive: false });
		box.addEventListener('scroll', onScroll, { passive: true });
		const onResize = () => measure();
		window.addEventListener('resize', onResize);
		return () => {
			box.removeEventListener('wheel', onWheel);
			box.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onResize);
		};
	});

	// ---- export -------------------------------------------------------------
	const stem = $derived(fileStem(topology.name, topology.stableId));

	function standaloneSvg(): string {
		if (!svgEl || !contentBox.width) throw new Error('the diagram is not rendered yet');
		const pad = 24;
		const clone = svgEl.cloneNode(true) as SVGSVGElement;
		clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		clone.setAttribute(
			'viewBox',
			`${contentBox.x - pad} ${contentBox.y - pad} ${contentBox.width + pad * 2} ${contentBox.height + pad * 2}`
		);
		clone.setAttribute('width', String(Math.ceil(contentBox.width + pad * 2)));
		clone.setAttribute('height', String(Math.ceil(contentBox.height + pad * 2)));
		clone.removeAttribute('style');
		const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
		const fontFamily = getComputedStyle(document.body).fontFamily;
		style.textContent = `text { font-family: ${fontFamily}; }`;
		clone.insertBefore(style, clone.firstChild);
		return new XMLSerializer().serializeToString(clone);
	}

	function exportBackground(): string {
		const body = getComputedStyle(document.body).backgroundColor;
		if (body && body !== 'rgba(0, 0, 0, 0)' && body !== 'transparent') return body;
		return dark ? '#0b1120' : '#ffffff';
	}

	async function pngBlob(): Promise<Blob> {
		if (!svgEl || !contentBox.width) throw new Error('the diagram is not rendered yet');
		const pad = 24;
		const width = contentBox.width + pad * 2;
		const height = contentBox.height + pad * 2;
		// Canvas size is bounded by the browser, so a large pathway is exported at
		// the largest scale that stays inside a safe canvas.
		const scale = Math.min(2, 4096 / Math.max(width, height));
		const source = new Blob([standaloneSvg()], { type: 'image/svg+xml;charset=utf-8' });
		const url = URL.createObjectURL(source);
		try {
			const image = new Image();
			image.decoding = 'async';
			await new Promise<void>((resolve, reject) => {
				image.onload = () => resolve();
				image.onerror = () => reject(new Error('the diagram could not be rasterised'));
				image.src = url;
			});
			const canvas = document.createElement('canvas');
			canvas.width = Math.ceil(width * scale);
			canvas.height = Math.ceil(height * scale);
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('canvas is unavailable');
			ctx.fillStyle = exportBackground();
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
			return await new Promise<Blob>((resolve, reject) => {
				canvas.toBlob(
					(blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
					'image/png'
				);
			});
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	const diagramFormats = $derived<ExportFormat[]>([
		{
			key: 'svg',
			label: 'SVG',
			filename: `${stem}.svg`,
			mime: 'image/svg+xml',
			build: () => standaloneSvg()
		},
		{ key: 'png', label: 'PNG', filename: `${stem}.png`, blob: () => pngBlob() }
	]);

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

	function startPan(event: PointerEvent) {
		if (event.button !== 0 || !scroller) return;
		dragFrom = {
			x: event.clientX,
			y: event.clientY,
			left: scroller.scrollLeft,
			top: scroller.scrollTop,
			moved: false
		};
		suppressClick = false;
		panning = true;
	}

	function movePan(event: PointerEvent) {
		if (!dragFrom || !scroller) return;
		const dx = event.clientX - dragFrom.x;
		const dy = event.clientY - dragFrom.y;
		if (!dragFrom.moved && Math.abs(dx) + Math.abs(dy) > 4) {
			dragFrom.moved = true;
			// Capture only once this is a drag: capturing on pointerdown would
			// route the click to the scroller and break node selection.
			scroller.setPointerCapture(event.pointerId);
		}
		if (!dragFrom.moved) return;
		event.preventDefault();
		scroller.scrollLeft = dragFrom.left - dx;
		scroller.scrollTop = dragFrom.top - dy;
	}

	function endPan(event: PointerEvent) {
		if (!dragFrom) return;
		suppressClick = dragFrom.moved;
		dragFrom = null;
		panning = false;
		if (scroller?.hasPointerCapture(event.pointerId)) {
			scroller.releasePointerCapture(event.pointerId);
		}
	}
</script>

<div class="space-y-2">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<InfoTip text={tr('pathway_diagram_hint')} label={tr('common_more_info')} />
		<div class="flex items-center gap-1">
			<Button size="xs" variant="outline" onclick={() => zoomAt(1 / 1.25)}
				>{tr('pathway_diagram_zoom_out')}</Button
			>
			<Button size="xs" variant="ghost" onclick={resetZoom}>{zoomPercent}%</Button>
			<Button size="xs" variant="outline" onclick={fitToView}>{tr('pathway_diagram_fit')}</Button>
			<Button size="xs" variant="outline" onclick={() => zoomAt(1.25)}
				>{tr('pathway_diagram_zoom_in')}</Button
			>
			<ExportMenu formats={diagramFormats} />
		</div>
	</div>

	{#if renderError}
		<div class="border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
			{tr('pathway_diagram_render_error')}: {renderError}
		</div>
	{/if}

	<div class="relative">
		<div
			bind:this={scroller}
			class="pathway-mermaid max-h-[72vh] overflow-auto border bg-muted/20"
			role="region"
			aria-label={topology.name}
			class:cursor-grabbing={panning}
			class:cursor-grab={!panning}
			onpointerdown={startPan}
			onpointermove={movePan}
			onpointerup={endPan}
			onpointercancel={endPan}
		>
			<div bind:this={host} style={`width:${contentBox.width * zoom}px`}></div>
		</div>
		{#if showMinimap}
			<canvas
				bind:this={minimap}
				class="absolute right-2 bottom-2 h-[104px] w-[148px] cursor-pointer border bg-background/90 shadow-sm"
				aria-label={tr('pathway_diagram_minimap')}
				onpointerdown={(event) => {
					(event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
					jumpTo(event);
				}}
				onpointermove={(event) => {
					if (event.buttons === 1) jumpTo(event);
				}}
			></canvas>
		{/if}
	</div>

	{#if usedCompartments.length}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
			<span>{tr('pathway_diagram_compartments')}</span>
			{#each usedCompartments as compartment (compartment.id)}
				<span class="inline-flex items-center gap-1.5">
					<span
						class="inline-block size-2.5 border"
						style={`background:${compartmentSwatch(compartmentIndex.get(compartment.id) ?? 0, dark)}`}
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
