<script lang="ts">
	import { page } from '$app/state';
	import { cassettes, vectors, constructs } from '$lib/api/client';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { toastOk } from '$lib/state/toast.svelte';
	import { shortPublicId } from '$lib/format';
	import Section from '$lib/components/Section.svelte';
	import Button from '$lib/components/Button.svelte';
	import FormFields from '$lib/components/FormFields.svelte';
	import type { FormField } from '$lib/components/form';
	import { buildSafe } from '$lib/components/form-values';
	import Textarea from '$lib/components/Textarea.svelte';
	import Select from '$lib/components/Select.svelte';

	type Mode = 'vector' | 'cassette' | 'assemble';
	// A record page's "Assemble construct" action links here with
	// mode=assemble, so open that tab instead of the vector builder.
	const wantsAssemble = page.url.searchParams.get('mode') === 'assemble';
	let mode = $state<Mode>(wantsAssemble ? 'assemble' : 'vector');

	// Vectors and cassettes are structured records, so the wizard speaks in
	// fields; the JSON textarea survives only as an override for people who
	// bring an export from a design tool.
	const VECTOR_MAIN: FormField[] = [
		{ name: 'name', required: true },
		{ name: 'topology', kind: 'select', options: ['circular', 'linear'], ns: 'tpo' },
		{ name: 'format', hint: tr('design_hint_format') },
		{ name: 'schemaVersion' },
		{ name: 'coordinateSystem' },
		{ name: 'license', kind: 'select', required: true, options: ['CC-BY-4.0', 'CC0-1.0'], hint: tr('design_hint_license') }
	];
	const VECTOR_ADV: FormField[] = [
		{ name: 'features', kind: 'objectList', hint: tr('design_hint_features'), itemFields: [{ key: 'id', required: true }, { key: 'type', required: true }, { key: 'start' }, { key: 'end' }, { key: 'strand' }, { key: 'note' }] },
		{ name: 'insertionSites', kind: 'objectList', hint: tr('design_hint_sites'), itemFields: [{ key: 'id', required: true }, { key: 'position' }] },
		{ name: 'sequenceArtifactId', kind: 'artifactPick', hint: tr('design_hint_artifact'), uploadDefaultKind: 'sequencing_trace' },
		{ name: 'provenance', kind: 'json', hint: tr('design_hint_provenance') }
	];
	const CASSETTE_MAIN: FormField[] = [
		{ name: 'parts', kind: 'objectList', required: true, hint: tr('design_hint_parts'), itemFields: [{ key: 'id', required: true }, { key: 'role', required: true }] },
		{ name: 'order', kind: 'list', hint: tr('design_hint_order') },
		{ name: 'hostSystem', kind: 'json', hint: tr('design_hint_host') },
		{ name: 'license', kind: 'select', required: true, options: ['CC-BY-4.0', 'CC0-1.0'], hint: tr('design_hint_license') }
	];
	const CASSETTE_ADV: FormField[] = [
		{ name: 'translation', kind: 'json', hint: tr('design_hint_translation') },
		{ name: 'codonUsage', kind: 'json' },
		{ name: 'provenance', kind: 'json', hint: tr('design_hint_provenance') }
	];

	let vValues = $state<Record<string, string>>({ topology: 'circular', license: 'CC-BY-4.0', format: 'spd-vector-1', schemaVersion: '1.0.0' });
	let cValues = $state<Record<string, string>>({ license: 'CC-BY-4.0' });
	let rawOverride = $state('');

	const VECTOR_EXAMPLE = '{\n  "name": "pET-SPD-demo",\n  "topology": "circular",\n  "features": [{ "id": "T7prom", "type": "promoter", "start": 1, "end": 20 }],\n  "provenance": { "license": "CC-BY-4.0" }\n}';
	const CASSETTE_EXAMPLE = '{\n  "hostSystem": { "organism": "E. coli BL21(DE3)" },\n  "parts": [{ "id": "target", "role": "cds" }],\n  "order": ["target"],\n  "provenance": { "license": "CC-BY-4.0" }\n}';

	let error = $state('');
	let saving = $state(false);
	let result = $state('');
	// the record just created, so the receipt can hand its id straight to the
	// assemble step instead of making the user copy it out of a JSON blob
	let lastCreated = $state<{ kind: 'vector' | 'cassette'; id: string; name: string } | null>(null);
	// assemble returns a bare construct id (assembly itself is not SPD's job)
	let assembledId = $state('');

	function setMode(m: Mode) {
		mode = m;
		error = '';
		result = '';
		lastCreated = null;
		assembledId = '';
		rawOverride = '';
		if (m === 'assemble') void loadRecent();
	}

	// ---- assemble: pick from what already exists, never paste an id ----
	let assembleVector = $state('');
	let assembleCassette = $state('');
	let assembleSite = $state('');
	let recentVectors = $state<Array<{ id: string; name: string }>>([]);
	let recentCassettes = $state<Array<{ id: string; label: string }>>([]);
	let vectorSites = $state<Array<{ id: string; position?: number }>>([]);
	let loaded = $state(false);

	// Query parameters from a record page prefill the pickers. Only fields the
	// user has left empty are seeded, so a manual choice is never overwritten.
	$effect(() => {
		if (mode !== 'assemble') return;
		const vectorId = page.url.searchParams.get('vectorId');
		const cassetteId = page.url.searchParams.get('cassetteId');
		if (vectorId && !assembleVector) assembleVector = vectorId;
		if (cassetteId && !assembleCassette) assembleCassette = cassetteId;
		void loadRecent();
	});

	async function loadRecent() {
		if (loaded) return;
		loaded = true;
		try {
			const [vr, cr] = await Promise.all([vectors.list(), cassettes.list()]);
			// the client's request() already unwraps the envelope → these are arrays
			const vrows = Array.isArray(vr) ? (vr as Array<Record<string, unknown>>) : [];
			const crows = Array.isArray(cr) ? (cr as Array<Record<string, unknown>>) : [];
			recentVectors = vrows.map((r) => ({ id: String(r.id ?? ''), name: String(r.name ?? '') || String(r.id ?? '') }));
			recentCassettes = crows.map((r) => {
				const parts = Array.isArray(r.parts) ? (r.parts as Array<Record<string, unknown>>) : [];
				const first = parts[0] ? String(parts[0].id ?? '') : '';
				return { id: String(r.id ?? ''), label: first ? `${first} · ${parts.length} parts` : shortPublicId(String(r.id ?? '')) };
			});
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	// choosing a vector widens the site menu to that vector's own insertion
	// sites — the one thing you cannot know without opening it
	$effect(() => {
		const id = assembleVector;
		if (!id) {
			vectorSites = [];
			return;
		}
		void (async () => {
			try {
				const v = (await vectors.get(id)) as unknown as Record<string, unknown>;
				const sites = Array.isArray(v.insertionSites) ? (v.insertionSites as Array<Record<string, unknown>>) : [];
				vectorSites = sites.map((s) => ({ id: String(s.id ?? ''), position: typeof s.position === 'number' ? s.position : undefined }));
				if (assembleSite && !vectorSites.some((s) => s.id === assembleSite)) assembleSite = '';
			} catch {
				vectorSites = [];
			}
		})();
	});

	const vectorOptions = $derived(recentVectors.map((v) => ({ value: v.id, label: `${v.name} · ${shortPublicId(v.id)}` })));
	const cassetteOptions = $derived(recentCassettes.map((c) => ({ value: c.id, label: `${c.label} · ${shortPublicId(c.id)}` })));
	const siteOptions = $derived(vectorSites.map((s) => ({ value: s.id, label: s.position != null ? `${s.id} @ ${s.position}` : s.id })));
	const vectorPlaceholder = $derived(recentVectors.length ? tr('design_pick_vector') : tr('design_no_vectors'));
	const cassettePlaceholder = $derived(recentCassettes.length ? tr('design_pick_cassette') : tr('design_no_cassettes'));

	function extractId(r: unknown): { id: string; data: Record<string, unknown> } {
		if (r && typeof r === 'object') {
			const o = r as Record<string, unknown>;
			const data = (o.data && typeof o.data === 'object' ? o.data : {}) as Record<string, unknown>;
			const id = o.id ?? o.publicId ?? data.id;
			if (typeof id === 'string' && id) return { id, data };
		}
		return { id: '', data: {} };
	}

	async function submit() {
		error = '';
		result = '';
		lastCreated = null;
		assembledId = '';
		saving = true;
		try {
			let body: Record<string, unknown>;
			if (rawOverride.trim()) {
				// the override is all-or-nothing: what you pasted is what ships
				body = JSON.parse(rawOverride) as Record<string, unknown>;
			} else if (mode === 'vector') {
				const b = buildSafe(vValues, [...VECTOR_MAIN, ...VECTOR_ADV]);
				if (b.error || !b.body) throw new Error(b.error ?? tr('form_required_missing'));
				body = b.body;
			} else {
				const b = buildSafe(cValues, [...CASSETTE_MAIN, ...CASSETTE_ADV]);
				if (b.error || !b.body) throw new Error(b.error ?? tr('form_required_missing'));
				body = b.body;
			}
			// license select → provenance. license, unless a raw provenance was
			// written under Advanced (then theirs wins, backend checks it)
			const lic = body.license as string | undefined;
			delete body.license;
			const prov = body.provenance as Record<string, unknown> | undefined;
			if (lic && (!prov || prov.license === undefined)) body.provenance = { ...(prov ?? {}), license: lic };
			if (mode === 'vector' && !body.name) throw new Error(tr('form_required_missing'));
			if (mode === 'cassette' && !Array.isArray(body.parts)) throw new Error(tr('form_required_missing'));
			const r = mode === 'vector' ? await vectors.create(body) : await cassettes.create(body);
			const { id, data } = extractId(r);
			result = JSON.stringify(r, null, 2);
			lastCreated = { kind: mode as 'vector' | 'cassette', id, name: String(data.name ?? (mode === 'vector' ? vValues.name : cValues.parts) ?? id) };
			// a freshly designed vector/cassette is immediately available to assemble
			if (mode === 'vector') recentVectors = [{ id, name: String(data.name ?? vValues.name ?? '') }, ...recentVectors.filter((v) => v.id !== id)];
			else recentCassettes = [{ id, label: shortPublicId(id) }, ...recentCassettes.filter((c) => c.id !== id)];
			loaded = true;
			toastOk(tr('submit_created'));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	function useInAssemble(kind: 'vector' | 'cassette') {
		const created = lastCreated;
		if (!created) return;
		mode = 'assemble';
		error = '';
		result = '';
		lastCreated = null;
		assembledId = '';
		void loadRecent();
		if (kind === 'vector') {
			assembleVector = created.id;
		} else {
			assembleCassette = created.id;
		}
	}

	async function submitAssemble() {
		error = '';
		result = '';
		lastCreated = null;
		saving = true;
		try {
			const r = await constructs.assemble({
				vector_id: assembleVector,
				cassette_id: assembleCassette,
				insertion_site_id: assembleSite || undefined
			});
			const cid = String((r as { constructId?: string })?.constructId ?? '');
			assembledId = cid;
			result = JSON.stringify(r, null, 2);
			toastOk(tr('submit_created'));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	const tabs: Array<{ m: Mode; key: string }> = [
		{ m: 'vector', key: 'submit_design_vector' },
		{ m: 'cassette', key: 'submit_design_cassette' },
		{ m: 'assemble', key: 'submit_design_assemble' }
	];
</script>

<div class="mx-auto max-w-3xl space-y-4">
	<h1 class="text-2xl font-bold">{tr('submit_design')}</h1>
	<p class="text-sm text-muted-foreground">{tr('design_intro')}</p>

	{#if !session.signedIn}
		<div class="flex items-center gap-3 rounded-none border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm">
			{tr('submit_login_needed')} <Button size="sm" onclick={() => session.signIn()}>{tr('nav_login')}</Button>
		</div>
	{:else}
		<div class="flex gap-1 text-sm">
			{#each tabs as t (t.m)}
				<Button size="sm" variant={mode === t.m ? 'primary' : 'secondary'} onclick={() => setMode(t.m)}>{tr(t.key)}</Button>
			{/each}
		</div>

		{#if error}<p class="rounded-none bg-destructive/10 p-2 text-xs text-destructive">{error}</p>{/if}

		{#if mode === 'assemble'}
			<Section title={tr('submit_design_assemble')}>
				<div class="space-y-3">
					<label class="block text-sm">
						<span class="text-xs text-muted-foreground">{tr('design_vector_label')}</span>
						<Select name="asm_vector" class="mt-1 w-full" bind:value={assembleVector} options={vectorOptions} placeholder={vectorPlaceholder} />
					</label>
					<label class="block text-sm">
						<span class="text-xs text-muted-foreground">{tr('design_cassette_label')}</span>
						<Select name="asm_cassette" class="mt-1 w-full" bind:value={assembleCassette} options={cassetteOptions} placeholder={cassettePlaceholder} />
					</label>
					<label class="block text-sm">
						<span class="text-xs text-muted-foreground">{tr('design_site_label')}</span>
						<Select name="asm_site" class="mt-1 w-full" bind:value={assembleSite} options={siteOptions} placeholder={tr('design_site_auto')} disabled={!assembleVector || !vectorSites.length} />
					</label>
					{#if assembleVector && vectorSites.length === 0}
						<p class="text-xs text-muted-foreground">{tr('design_site_none')}</p>
					{/if}
					<div class="flex justify-end">
						<Button onclick={submitAssemble} disabled={saving || !assembleVector || !assembleCassette}>{tr('common_submit')}</Button>
					</div>
					<p class="rounded-none bg-sky-50 dark:bg-sky-500/10 p-2 text-xs text-sky-900 dark:text-sky-200">{tr('design_assemble_note')}</p>
				</div>
			</Section>
		{:else}
			<Section title={mode === 'vector' ? tr('submit_design_vector') : tr('submit_design_cassette')}>
				{#if mode === 'vector'}
					<FormFields fields={VECTOR_MAIN} bind:values={vValues} columns={2} />
					<details class="mt-3">
						<summary class="cursor-pointer text-xs text-muted-foreground">{tr('submit_advanced')}</summary>
						<div class="mt-2"><FormFields fields={VECTOR_ADV} bind:values={vValues} /></div>
					</details>
					<details class="mt-3">
						<summary class="cursor-pointer text-xs text-muted-foreground">{tr('design_raw_override')}</summary>
						<div class="mt-2"><Textarea name="designRaw" monospace rows={12} bind:value={rawOverride} placeholder={VECTOR_EXAMPLE} /></div>
					</details>
				{:else}
					<FormFields fields={CASSETTE_MAIN} bind:values={cValues} columns={2} />
					<details class="mt-3">
						<summary class="cursor-pointer text-xs text-muted-foreground">{tr('submit_advanced')}</summary>
						<div class="mt-2"><FormFields fields={CASSETTE_ADV} bind:values={cValues} /></div>
					</details>
					<details class="mt-3">
						<summary class="cursor-pointer text-xs text-muted-foreground">{tr('design_raw_override')}</summary>
						<div class="mt-2"><Textarea name="designRaw" monospace rows={12} bind:value={rawOverride} placeholder={CASSETTE_EXAMPLE} /></div>
					</details>
				{/if}
				<div class="mt-3 flex justify-end">
					<Button onclick={submit} disabled={saving}>{tr('common_submit')}</Button>
				</div>
			</Section>
		{/if}

		{#if lastCreated}
			{@const lc = lastCreated}
			<div class="rounded-none bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-900 dark:text-emerald-200">
				{tr('submit_created')} · <a class="font-mono underline" href="/{lc.kind === 'vector' ? 'vectors' : 'cassettes'}/{lc.id}">{lc.id}</a>
				<div class="mt-2 flex gap-2">
					<Button size="sm" variant="outline" onclick={() => useInAssemble(lc.kind)}>{tr('design_use_in_assemble')}</Button>
				</div>
			</div>
		{:else if assembledId}
			<div class="rounded-none bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-900 dark:text-emerald-200">
				{tr('submit_created')} · <a class="font-mono underline" href="/constructs/{assembledId}">{assembledId}</a>
				<p class="mt-1 text-xs text-emerald-800 dark:text-emerald-300">{tr('design_assemble_done')}</p>
			</div>
		{:else if result}
			<Section title={tr('submit_receipt')}>
				<pre class="overflow-auto rounded-none bg-muted p-3 font-mono text-xs">{result}</pre>
			</Section>
		{/if}
	{/if}
</div>

<svelte:head><title>{tr('submit_design')} · SPD</title></svelte:head>
