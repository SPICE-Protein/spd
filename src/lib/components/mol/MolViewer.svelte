<script lang="ts">
	import { tr } from '$lib/i18n';
	import { artifacts as artifactApi } from '$lib/api/client';
	import { isBincifBytes } from '$lib/mol/bincif';
	import Button from '../Button.svelte';
	import { discoverCoords, atomsToPdb, type CoordsSource } from '$lib/mol/discover';
	import type { Color as MolColor } from 'molstar/lib/mol-util/color';

	/** Mol* brands packed RGB numbers as `Color`; the runtime value is the number. */
	const molColor = (value: number) => value as unknown as MolColor;

	/** structural view over ArtifactRecord / FoldArtifactRecord — only what the viewer needs */
	interface ViewerArtifact {
		id: string;
		kind?: string | null;
		mediaType?: string | null;
		status?: string | null;
	}

	/**
	 * Mol* viewer for a predicted fold. Sources, in the order offered:
	 *   1. coordinates INLINE in `fold.prediction` (the pipeline's free-form JSON),
	 *   2. structure ARTIFACT bytes fetched from `GET /artifacts/:id/content` —
	 *      BinaryCIF (`chemical/bincif`) goes to Mol* as raw bytes; mmcif/pdb
	 *      text artifacts are decoded and offered as text. Mol*'s mmcif
	 *      provider sniffs bcif vs text itself, so both speak "mmcif" here.
	 * When nothing is renderable the viewer says so instead of faking a cartoon.
	 */
	let {
		prediction = undefined,
		sequence = undefined,
		artifacts = [],
		height = 520,
		title = undefined
	}: {
		prediction?: Record<string, unknown> | null;
		sequence?: string;
		/** resolved artifact records for this fold (GET /folds/:id/artifacts) */
		artifacts?: ViewerArtifact[];
		height?: number;
		title?: string;
	} = $props();

	let container = $state<HTMLDivElement | null>(null);
	let status = $state<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
	let message = $state('');
	let viaLabel = $state('');

	let plugin: import('molstar/lib/mol-plugin-ui/context').PluginUIContext | null = null;
	let molstarLoaded = $state(false);
	let exporting = $state(false);
	let exportError = $state('');

	// Publication palette: muted enough for a white page, still separable in
	// greyscale and for the common forms of colour blindness.
	const PAPER_CHAIN_COLORS = [
		0x4f9d9a, 0xd8a24a, 0xc76d7c, 0x7188b8, 0x8fa35a, 0x8e6fa8, 0xc9a66b, 0x9aa0a6
	];

	/**
	 * Look borrowed from the way structural figures are prepared for journals:
	 * white paper, soft ambient occlusion, a thin dark silhouette, no bloom or
	 * hard shadows, and a two-light setup instead of the default single key.
	 */
	function applyPublicationStyle(ctx: import('molstar/lib/mol-plugin-ui/context').PluginUIContext) {
		ctx.canvas3d?.setProps({
			cameraFog: { name: 'off', params: {} },
			renderer: {
				backgroundColor: molColor(0xffffff),
				exposure: 1,
				ambientColor: molColor(0xffffff),
				ambientIntensity: 0.55,
				light: [
					{ inclination: 140, azimuth: 320, color: molColor(0xffffff), intensity: 0.75 },
					{ inclination: 70, azimuth: 40, color: molColor(0xffffff), intensity: 0.25 }
				]
			},
			postprocessing: {
				enabled: true,
				occlusion: {
					name: 'on',
					params: {
						samples: 64,
						multiScale: { name: 'off', params: {} },
						radius: 4.5,
						bias: 0.9,
						blurKernelSize: 15,
						blurDepthBias: 0.5,
						resolutionScale: 1,
						color: 0x000000,
						transparentThreshold: 0.4
					}
				},
				outline: {
					name: 'on',
					params: { scale: 1.5, threshold: 0.4, color: 0x3f3f46, includeTransparent: true }
				},
				shadow: { name: 'off', params: {} },
				bloom: { name: 'off', params: {} }
			}
		});
	}

	async function ensurePlugin() {
		if (plugin || !container) return;
		status = 'loading';
		try {
			const [{ createPluginUI }, { renderReact18 }, { DefaultPluginUISpec }] = await Promise.all([
				import('molstar/lib/mol-plugin-ui'),
				import('molstar/lib/mol-plugin-ui/react18'),
				import('molstar/lib/mol-plugin-ui/spec')
			]);
			await import('molstar/lib/mol-plugin-ui/skin/light.scss');
			// Mol*'s stock four-region layout (view settings | viewport |
			// structure | log) is sized for a standalone app: it needs roughly
			// 1200px and overflows any record card, and its left/right panes
			// squeeze the canvas to a strip. SPD embeds the viewer, so keep the
			// viewport and drop the panes; the record page carries the metadata.
			const spec = DefaultPluginUISpec();
			const ctx = await createPluginUI({
				target: container,
				render: renderReact18,
				spec: {
					...spec,
					components: {
						...spec.components,
						controls: { top: 'none', left: 'none', right: 'none', bottom: 'none' },
						hideTaskOverlay: true,
						disableDragOverlay: true
					}
				}
			});
			// The expand toggle switches the layout to `position: fixed`, which
			// escapes the card and covers the page header; the embedded viewer
			// has no such mode. Screenshot controls are off for the same reason
			// (they open another pane inside a pane).
			const { PluginConfig } = await import('molstar/lib/mol-plugin/config');
			ctx.config.set(PluginConfig.Viewport.ShowExpand, false);
			ctx.config.set(PluginConfig.Viewport.ShowScreenshotControls, false);
			ctx.config.set(PluginConfig.Viewport.ShowControls, false);
			applyPublicationStyle(ctx);
			plugin = ctx as unknown as typeof plugin;
			molstarLoaded = true;
		} catch (e) {
			status = 'error';
			message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
			throw e;
		}
	}

	const structureSources = $derived.by(() => {
		const list: Array<{ key: string; label: string; load: () => Promise<CoordsSource | null> }> = [];
		if (prediction) {
			list.unshift({
				key: 'inline',
				label: tr('mol_source_inline'),
				load: async () => discoverCoords(prediction)
			});
		}
		for (const a of artifacts) {
			if (!a?.id) continue;
			const kind = a.kind ?? '';
			// bincif is the storage kind now; the retired text kinds stay on this
			// list so records from before 2026-10-02 keep rendering
			if (
				['full_structure_bincif', 'full_structure_mmcif', 'full_structure_pdb', 'c_alpha_coordinates'].includes(
					kind
				)
			) {
				list.push({
					key: a.id,
					label: `${tr('mol_source_artifact')} ${a.id.split(':').pop()?.slice(0, 8)} · ${kind}`,
					load: async () => {
						if (a.status && a.status !== 'completed') return null;
						const bytes = new Uint8Array(await artifactApi.contentBytes(a.id));
						if (kind === 'c_alpha_coordinates') {
							return discoverCoords(JSON.parse(new TextDecoder().decode(bytes)));
						}
						if (kind === 'full_structure_bincif' || a.mediaType === 'chemical/bincif' || isBincifBytes(bytes)) {
							return { format: 'cif', bytes, via: `artifact:${kind}` };
						}
						const text = new TextDecoder().decode(bytes);
						return { format: kind === 'full_structure_pdb' ? 'pdb' : 'cif', text, via: `artifact:${kind}` };
					}
				});
			}
		}
		return list;
	});

	let activeKey = $state('');

	async function loadSource(src?: (typeof structureSources)[number]) {
		if (!src) return;
		activeKey = src.key;
		try {
			await ensurePlugin();
			if (!plugin) return;
			status = 'loading';
			message = '';
			await plugin.clear();
			const found = await src.load();
			if (!found) {
				status = 'empty';
				message = tr('mol_no_bytes');
				return;
			}
			const payload: string | Uint8Array<ArrayBuffer> =
				found.bytes ?? found.text ?? atomsToPdb(found.atoms ?? [], title ?? 'SPD');
			// Mol*'s mmcif provider sniffs BinaryCIF from bytes; only a
			// text-atom fallback (atomsToPdb) is pdb for sure
			const format = typeof payload === 'string' ? (found.text ? (found.format === 'cif' ? 'mmcif' : 'pdb') : 'pdb') : 'mmcif';
			const data = await plugin.builders.data.rawData({ data: payload });
			const trajectory = await plugin.builders.structure.parseTrajectory(data, format);
			const model = await plugin.builders.structure.createModel(trajectory);
			const structure = await plugin.builders.structure.createStructure(model);
			// `auto` switches small structures to atomic detail, which reads as a
			// ball-and-stick cloud. Journals almost always show the fold as a
			// cartoon with ligands as sticks, so use that preset explicitly.
			await plugin.builders.structure.representation.applyPreset(structure, 'polymer-and-ligand', {
				theme: {
					globalName: 'chain-id',
					globalColorParams: {
						palette: {
							name: 'colors',
							params: { list: { kind: 'set', colors: PAPER_CHAIN_COLORS } }
						}
					},
					// Heteroatom carbons keep a chemistry-readable scheme; colouring
					// them by chain would paint ligand sticks the protein colour.
					carbonColor: 'element-symbol'
				}
			});
			viaLabel = found.via;
			status = 'ready';
		} catch (e) {
			status = 'error';
			message = e instanceof Error ? e.message : String(e);
		}
	}

	function exportStem() {
		const raw = (title ?? '').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
		return (raw || 'spd-structure').slice(0, 80);
	}

	async function exportImage() {
		if (!plugin || exporting) return;
		const helper = plugin.helpers.viewportScreenshot;
		if (!helper) {
			exportError = tr('mol_export_failed');
			return;
		}
		exporting = true;
		exportError = '';
		try {
			// 2400 x 1600 is a two-column journal figure at roughly 300 dpi
			// without the memory cost of an 8K pass.
			helper.behaviors.values.next({
				...helper.values,
				resolution: { name: 'custom', params: { width: 2400, height: 1600 } },
				format: { name: 'png', params: {} },
				transparent: false,
				axes: { name: 'off', params: {} }
			});
			await helper.download(`${exportStem()}-${new Date().toISOString().slice(0, 10)}.png`);
		} catch (e) {
			exportError = e instanceof Error ? e.message : String(e);
		} finally {
			exporting = false;
		}
	}

	// load the best available source whenever the prop set changes
	const primarySource = $derived(structureSources[0]);
	$effect(() => {
		const src = primarySource;
		if (!src || src.key === activeKey) return;
		void loadSource(src);
	});

	$effect(() => {
		return () => {
			plugin?.dispose?.();
			plugin = null;
			molstarLoaded = false;
		};
	});
</script>

<div class="min-w-0 overflow-hidden rounded-none border">
	<div class="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
		<span class="text-xs font-medium text-muted-foreground">
			{title ?? tr('mol_3d_view')}
			{#if status === 'ready' && viaLabel}<span class="ml-1 font-normal">· {tr('mol_via')} {viaLabel}</span>{/if}
		</span>
		<div class="flex items-center gap-2">
			{#if structureSources.length > 1}
				<select class="rounded-none border bg-background px-1.5 py-0.5 text-xs" bind:value={activeKey} onchange={(e) => loadSource(structureSources.find((s) => s.key === (e.target as HTMLSelectElement).value))}>
					{#each structureSources as s (s.key)}
						<option value={s.key}>{s.label}</option>
					{/each}
				</select>
			{/if}
			{#if status === 'ready'}
				<Button
					size="xs"
					variant="ghost"
					class="text-muted-foreground"
					disabled={exporting}
					onclick={exportImage}
					title={tr('mol_export_hint')}
				>
					{exporting ? tr('mol_exporting') : `↓ ${tr('mol_export_image')}`}
				</Button>
				<Button size="xs" variant="ghost" class="text-muted-foreground" onclick={() => { activeKey = ''; void loadSource(primarySource); }} title={tr('mol_reload')}>⟳</Button>
			{/if}
		</div>
	</div>

	{#if exportError}
		<p class="border-b bg-destructive/10 px-3 py-1 text-xs text-destructive">
			{tr('mol_export_failed')} · {exportError}
		</p>
	{/if}

	<div class="relative min-w-0 overflow-hidden" style={`height:${height}px`}>
		<div bind:this={container} class="h-full w-full min-w-0"></div>

		{#if !molstarLoaded && status !== 'error'}
			<div class="absolute inset-0 flex items-center justify-center bg-muted/20 text-sm text-muted-foreground">
				{status === 'loading' ? tr('common_loading') : tr('mol_preparing')}
			</div>
		{:else if status === 'empty'}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/80 p-6 text-center">
				<p class="text-sm font-medium">{tr('mol_empty_title')}</p>
				<p class="max-w-md text-xs text-muted-foreground">{message || tr('mol_no_bytes')}</p>
			</div>
		{:else if status === 'error'}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/80 p-6 text-center">
				<p class="text-sm font-medium text-destructive">{tr('mol_error_title')}</p>
				<p class="max-w-md break-all text-xs text-muted-foreground">{message}</p>
			</div>
		{:else if status === 'loading' && molstarLoaded}
			<div class="absolute right-2 top-2 rounded-none bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow">{tr('common_loading')}</div>
		{/if}
	</div>
</div>
