<script lang="ts">
	import { uploads, artifacts } from '$lib/api/client';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { toastOk } from '$lib/state/toast.svelte';
	import Section from './Section.svelte';
	import InfoTip from './InfoTip.svelte';
	import Button from './Button.svelte';
	import Badge from './Badge.svelte';
	import Input from './Input.svelte';
	import Select from './Select.svelte';

	/**
	 * The full SPD upload ritual: (pre-flight BinaryCIF conversion for the
	 * structure lane) → preflight → PUT bytes (grant is single-use,
	 * size/content-type must match) → artifact record (status pending) →
	 * complete. Bytes live in R2; only the metadata record is queryable here.
	 *
	 * compact=true strips the Section chrome for embedding inside submit
	 * wizards — files belong to the record being created, not to a separate
	 * "upload" destination the user has to know about.
	 */
	let {
		ondone = undefined,
		compact = false,
		defaultKind = 'full_structure_bincif',
		zipOnly = false
	}: {
		ondone?: (artifactId: string) => void;
		compact?: boolean;
		defaultKind?: string;
		zipOnly?: boolean;
	} = $props();

	// artifact kind allowlist (backend SUPPORTED_KINDS). Structure storage is
	// BinaryCIF-only: the retired full_structure_mmcif/_pdb text kinds no
	// longer accept new uploads (legacy rows stay readable via the viewer).
	const KINDS = [
		'c_alpha_coordinates',
		'full_structure_bincif',
		'distogram',
		'contact_matrix',
		'mutation_probabilities',
		'md_trajectory',
		'energy_history',
		'stability_scan',
		'phase_diagram',
		'pocket_geometry',
		'raw_assay_data',
		'spectrum',
		'microscopy_image',
		'gel_image',
		'sequencing_trace',
		'alignment',
		'supplementary_zip'
	];

	let file = $state<File | null>(null);
	// the embedding wizard picks one lane for the kind menu; inside this
	// component that choice is a mount-time constant by design
	// svelte-ignore state_referenced_locally
	let kind = $state(defaultKind);
	let license = $state('CC-BY-4.0');
	// matrix artifacts (distograms, contact maps) carry a {rows, cols} shape;
	// two numbers beat making people type JSON
	let shapeRows = $state('');
	let shapeCols = $state('');
	let stage = $state<
		'idle' | 'convert' | 'preflight' | 'put' | 'record' | 'complete' | 'done' | 'error'
	>('idle');
	let message = $state('');
	let artifactId = $state('');

	const isBincifLane = $derived(kind === 'full_structure_bincif');
	const isZipLane = $derived(zipOnly || kind === 'supplementary_zip');
	const stages = $derived(
		(isBincifLane
			? ['convert', 'preflight', 'put', 'record', 'complete']
			: ['preflight', 'put', 'record', 'complete']) as Array<
			'convert' | 'preflight' | 'put' | 'record' | 'complete'
		>
	);
	const stageLabels: Record<string, string> = {
		convert: tr('upload_stage_convert'),
		preflight: tr('upload_stage_preflight'),
		put: tr('upload_stage_put'),
		record: tr('upload_stage_record'),
		complete: tr('upload_stage_complete')
	};

	const busy = $derived(
		stage === 'convert' ||
			stage === 'preflight' ||
			stage === 'put' ||
			stage === 'record' ||
			stage === 'complete'
	);

	// a stage outside the visible ladder (idle/error/done) simply never
	// matches — indexOf over the string list keeps the template honest
	function badgeTone(s: (typeof stages)[number]): 'info' | 'ok' | 'muted' {
		if (stage === s) return 'info';
		const walk: string[] = stages;
		return walk.indexOf(stage) > walk.indexOf(s) ? 'ok' : 'muted';
	}

	async function run() {
		if (!file || !session.user) return;
		message = '';
		try {
			let bytes = new Uint8Array(await file.arrayBuffer());
			let contentType = file.type || 'application/octet-stream';

			// The bincif lane converts cif text to BinaryCIF here, in the
			// browser — SPD stores, it never computes, so the worker would
			// not do this, and the ledger digests exactly the bytes stored.
			let name = file.name;
			if (isBincifLane) {
				const mol = await import('$lib/mol/bincif');
				if (!mol.isBincifBytes(bytes)) {
					const text = new TextDecoder('utf-8').decode(bytes);
					if (!mol.isCifText(text)) {
						stage = 'error';
						message = tr('upload_bincif_needed');
						return;
					}
					stage = 'convert';
					bytes = await mol.cifTextToBinaryCif(text);
				}
				contentType = 'chemical/bincif';
				// the stored object's name must say what the bytes are
				if (!/\.bcif$/i.test(name)) name = name.replace(/\.(cif|mcif|mmcif|pdb)$/i, '') + '.bcif';
			}

			if (isZipLane) {
				if (!/\.zip$/i.test(name)) {
					stage = 'error';
					message = tr('supplementary_zip_only');
					return;
				}
				// A renamed .txt is not a zip. Accept the three local-file
				// signatures (new archive, empty archive, spanned marker) before
				// spending a preflight grant on it.
				const zipMagic =
					bytes[0] === 0x50 &&
					bytes[1] === 0x4b &&
					((bytes[2] === 0x03 && bytes[3] === 0x04) ||
						(bytes[2] === 0x05 && bytes[3] === 0x06) ||
						(bytes[2] === 0x07 && bytes[3] === 0x08));
				if (!zipMagic) {
					stage = 'error';
					message = tr('supplementary_zip_invalid');
					return;
				}
				contentType = 'application/zip';
			}

			const sha = await uploads.hash(bytes);

			stage = 'preflight';
			const objectKey = `users/${session.user.id}/uploads/${Date.now()}-${name.replace(/[^\w.\-]/g, '_')}`;
			const pre = await uploads.preflight({
				object_key: objectKey,
				content_type: contentType,
				size: bytes.byteLength
			});

			stage = 'put';
			// rebuilt from the grant token, not pre.uploadUrl — see uploads.putUrl
			await uploads.send(uploads.putUrl(pre.token), bytes, contentType);

			stage = 'record';
			const rec = await artifacts.create({
				object_key: pre.objectKey,
				kind,
				media_type: contentType,
				byte_length: bytes.byteLength,
				sha256: sha,
				license,
				shape:
					shapeRows && shapeCols ? { rows: Number(shapeRows), cols: Number(shapeCols) } : undefined
			});
			artifactId = rec.artifactId;

			stage = 'complete';
			await artifacts.complete(artifactId, { sha256: sha, byteLength: bytes.byteLength });
			stage = 'done';
			toastOk(tr('upload_done'));
			ondone?.(artifactId);
		} catch (e) {
			stage = 'error';
			message = e instanceof Error ? e.message : String(e);
		}
	}
</script>

{#snippet body()}
	{#if compact}
		<p
			class="rounded-none bg-amber-50 dark:bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-200"
		>
			⚠ {tr('upload_cc_notice')}
		</p>
	{/if}
	{#if !session.signedIn}
		<div class="flex items-center justify-between">
			<p class="text-sm text-muted-foreground">{tr('upload_login')}</p>
			<Button size="sm" onclick={() => session.signIn()}>{tr('nav_login')}</Button>
		</div>
	{:else}
		<div class="space-y-3">
			<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<label class="block text-sm">
					<span class="flex items-center gap-1 text-xs text-muted-foreground">
						{tr('upload_file')}
						{#if isZipLane}
							<InfoTip
								text={tr('supplementary_zip_hint')}
								label={`${tr('upload_file')} — ${tr('common_more_info')}`}
							/>
						{/if}
					</span>
					<input
						type="file"
						accept={isZipLane ? '.zip,application/zip' : undefined}
						class="mt-1 w-full rounded-none border px-2 py-1.5 text-sm"
						onchange={(e) => {
							file = (e.target as HTMLInputElement).files?.[0] ?? null;
							if (file && !kind) kind = 'full_structure_bincif';
						}}
					/>
				</label>
				{#if zipOnly}
					<div class="block text-sm">
						<span class="text-xs text-muted-foreground">{tr('f_kind')}</span>
						<p class="mt-1 text-sm font-medium">{tr('supplementary_materials')}</p>
						<p class="text-xs text-muted-foreground">{tr('supplementary_zip_label')}</p>
					</div>
				{:else}
					<label class="block text-sm">
						<span class="text-xs text-muted-foreground">{tr('f_kind')}</span>
						<Select
							name="up_kind"
							class="mt-1 w-full"
							bind:value={kind}
							options={KINDS.map((k) => ({ value: k, label: k }))}
						/>
					</label>
				{/if}
				<label class="block text-sm">
					<span class="text-xs text-muted-foreground">{tr('f_license')}</span>
					<Select
						name="up_license"
						class="mt-1 w-full"
						bind:value={license}
						options={[{ value: 'CC-BY-4.0', label: 'CC-BY-4.0' }]}
					/>
				</label>
				<div class="text-sm">
					<span class="text-xs text-muted-foreground">{tr('f_shape')} ({tr('optional_hint')})</span>
					<div class="mt-1 flex gap-2">
						<Input
							name="up_shape_rows"
							type="number"
							class="h-8 w-1/2"
							placeholder="rows"
							bind:value={shapeRows}
						/>
						<Input
							name="up_shape_cols"
							type="number"
							class="h-8 w-1/2"
							placeholder="cols"
							bind:value={shapeCols}
						/>
					</div>
				</div>
			</div>

			{#if stage !== 'idle' && stage !== 'done'}
				<div class="flex flex-wrap gap-2 text-xs">
					{#each stages as s, i (s)}
						<Badge tone={badgeTone(s)}>
							{i + 1}. {stageLabels[s]}{stage === s ? '…' : ''}
						</Badge>
					{/each}
				</div>
			{/if}

			{#if stage === 'error'}
				<p class="rounded-none bg-destructive/10 p-2 text-xs text-destructive">{message}</p>
			{:else if stage === 'done'}
				<p
					class="rounded-none bg-emerald-50 dark:bg-emerald-500/10 p-2 text-xs text-emerald-800 dark:text-emerald-300"
				>
					{tr('upload_done')}
					<a class="underline font-mono" href="/artifacts/{artifactId}">{artifactId}</a>
				</p>
			{:else}
				<div class="flex justify-end">
					<Button onclick={run} disabled={!file || busy}>
						{tr('upload_start')}
					</Button>
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

{#if compact}
	<div class="space-y-3">{@render body()}</div>
{:else}
	<Section title={tr('upload_title')}>
		<p
			class="rounded-none border-2 border-amber-500/70 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-base font-semibold text-amber-950 dark:text-amber-200"
		>
			⚠ {tr('upload_cc_notice')}
		</p>
		<div class="mt-3">{@render body()}</div>
	</Section>
{/if}
