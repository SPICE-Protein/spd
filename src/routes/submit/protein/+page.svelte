<script lang="ts">
	import { proteins } from '$lib/api/client';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { toastOk } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import Button from '$lib/components/Button.svelte';
	import FormFields from '$lib/components/FormFields.svelte';
	import type { FormField } from '$lib/components/form';
	import { buildSafe } from '$lib/components/form-values';
	import { draft } from '$lib/state/drafts.svelte';
	import DraftNote from '$lib/components/DraftNote.svelte';

	// one browser-local slot per wizard; submitting clears it
	const DRAFT_KEY = 'submit/protein';

	const MAIN_FIELDS: FormField[] = [
		{ name: 'preferredName', required: true },
		{ name: 'geneName' },
		{ name: 'organism_taxId', kind: 'organism', companion: 'organism_scientificName', label: tr('submit_organism_name'), hint: tr('organism_hint_pair') },
		{ name: 'entryName' },
		{ name: 'fullName' },
		{ name: 'ecNumber', hint: tr('f_ec_number_hint') },
		{ name: 'keywords', kind: 'objectList', itemFields: [{ key: 'name', required: true }], hint: tr('keywords_wizard_hint') },
		{ name: 'tags', kind: 'list', hint: tr('form_hint_comma_list') },
		{ name: 'license', kind: 'select', options: ['CC-BY-4.0'] }
	];
	// External ids (UniProt, PDB, GenBank…) become one card per reference.
	// Round 9: the item keys mirror ExternalReferenceInput exactly — `id`
	// was silently stored as junk before the shape became a real contract,
	// and deny_unknown_fields now refuses it, so the wizard must write the
	// wire name (`externalId`) or it would 422 its own submissions.
	const ADV_FIELDS: FormField[] = [
		{ name: 'externalReferences', kind: 'objectList', hint: tr('form_hint_json_object'), itemFields: [{ key: 'source' }, { key: 'externalId' }, { key: 'url' }] },
		{ name: 'sourceEntryStatus', kind: 'select', ns: 'status', options: ['reviewed', 'unreviewed'], hint: tr('source_entry_status_hint') },
		{ name: 'altNames', kind: 'list', hint: tr('form_hint_comma_list') },
		{ name: 'geneSynonyms', kind: 'list', hint: tr('form_hint_comma_list') },
		{ name: 'orfNames', kind: 'list', hint: tr('form_hint_comma_list') },
		{ name: 'entryVersion', kind: 'number' },
		{ name: 'sequenceVersion', kind: 'number' },
		{ name: 'sequenceCrc64', label: tr('f_sequenceCrc64'), hint: tr('crc64_wizard_hint') },
		{ name: 'organismLineage', kind: 'json', label: tr('f_lineage'), hint: tr('lineage_wizard_hint') }
	];
	const FIELDS = [...MAIN_FIELDS, ...ADV_FIELDS];

	const BLANK: Record<string, string> = { license: 'CC-BY-4.0' };
	let values = $state<Record<string, string>>({ ...BLANK });
	let error = $state('');
	let saving = $state(false);
	let result = $state<{ id: string; created: boolean } | null>(null);

	async function submit() {
		error = '';
		result = null;
		const b = buildSafe(values, FIELDS);
		if (b.error || !b.body) return (error = b.error ?? tr('form_required_missing'));
		const body = { ...b.body };
		if (body.organism_scientificName || body.organism_taxId) {
			body.organism = { scientificName: body.organism_scientificName ?? null, taxId: body.organism_taxId ?? null };
		}
		delete body.organism_scientificName;
		delete body.organism_taxId;
		if (!body.preferredName) return (error = tr('form_required_missing'));
		saving = true;
		try {
			const r = await proteins.create(body as never);
			result = { id: r.protein.id, created: !!r.created };
			toastOk(tr('submit_created'));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl space-y-4">
	<h1 class="text-2xl font-bold">{tr('submit_protein')}</h1>
	<Section>
		{#if error}<p class="mb-3 rounded-none bg-destructive/10 p-2 text-xs text-destructive">{error}</p>{/if}
		{#if result}
			<p class="rounded-none bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-900 dark:text-emerald-200">
				{result.created ? tr('submit_created') : tr('submit_existed')} ·
				<a class="underline font-mono" href="/proteins/{result.id}">{result.id}</a>
			</p>
			<div class="mt-3 flex gap-2">
				<Button size="sm" href="/proteins/{result.id}">{tr('submit_go_protein')}</Button>
				<Button size="sm" variant="outline" href="/submit/sequence?proteinId={result.id}&proteinName={encodeURIComponent(String(values.preferredName ?? ''))}">{tr('submit_then_sequence')}</Button>
			</div>
		{:else if session.signedIn}
			<DraftNote k={DRAFT_KEY} {values} blank={BLANK} />
			<FormFields fields={MAIN_FIELDS} bind:values columns={2} />
			<details class="mt-3">
				<summary class="cursor-pointer text-xs text-muted-foreground">{tr('submit_advanced')}</summary>
				<div class="mt-2">
					<FormFields fields={ADV_FIELDS} bind:values />
				</div>
			</details>
			<div class="mt-3 flex justify-end">
				<Button onclick={submit} disabled={saving}>{tr('common_submit')}</Button>
			</div>
		{:else}
			<div class="flex items-center justify-between">
				<p class="text-sm text-muted-foreground">{tr('submit_login_needed')}</p>
				<Button onclick={() => session.signIn()}>{tr('nav_login')}</Button>
			</div>
		{/if}
	</Section>
</div>

<svelte:head><title>{tr('submit_protein')} · SPD</title></svelte:head>
