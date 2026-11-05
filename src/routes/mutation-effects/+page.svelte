<script lang="ts">
	import { mutationEffects, firstArray } from '$lib/api/client';
	import type { MutationEffectRow } from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtTime, EFFECT_CLASSES } from '$lib/format';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import DataTable from '$lib/components/DataTable.svelte';
	import type { Column } from '$lib/components/table';
	import Dialog from '$lib/components/Dialog.svelte';
	import FormFields from '$lib/components/FormFields.svelte';
	import type { FormField } from '$lib/components/form';
	import { buildSafe } from '$lib/components/form-values';
	import Textarea from '$lib/components/Textarea.svelte'
	import Field from '$lib/components/Field.svelte'
	import TargetPicker from '$lib/components/TargetPicker.svelte'

	let rows = $state<MutationEffectRow[]>([]);
	let loading = $state(true);
	let error = $state('');

	async function load() {
		loading = true;
		try {
			const data = await mutationEffects.list();
			rows = firstArray<MutationEffectRow>(data, 'mutationEffects', 'items');
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}
	void load();

	const FIELDS: FormField[] = [
		{ name: 'sequenceId', required: true, picker: 'sequence', hint: tr('me_hint_sequence') },
		{ name: 'positions', kind: 'intList', required: true, hint: tr('me_hint_positions') },
		{ name: 'fromResidues', kind: 'list', required: true, hint: tr('me_hint_single_letter') },
		{ name: 'toResidues', kind: 'list', required: true, hint: tr('me_hint_single_letter') },
		{ name: 'effectClass', kind: 'select', required: true, options: [...EFFECT_CLASSES], ns: 'ec' },
		{ name: 'dgValue', kind: 'number', hint: tr('me_hint_dg') },
		{ name: 'interactionTerm', kind: 'number', hint: tr('me_hint_epi') },
		{ name: 'confidence', kind: 'number', hint: tr('form_hint_0_1') },
		{ name: 'environment', kind: 'json' },
		{ name: 'crossReferences', kind: 'json' }
	];

	let showCreate = $state(false);
	let values = $state<Record<string, string>>({});
	let formError = $state('');
	let saving = $state(false);

	function csvRecords(text: string): Array<Record<string, unknown>> {
		// pos,from,to,class[,dG]  — one per line, e.g. "12,A,V,-0.8"
		return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
			const [pos, from, to, cls, dg] = l.split(',').map((x) => x.trim());
			return {
				sequenceId: values.sequenceId,
				positions: [Number(pos)],
				fromResidues: [from.toUpperCase()],
				toResidues: [to.toUpperCase()],
				effectClass: cls,
				...(dg ? { dgValue: Number(dg) } : {})
			};
		});
	}

	let bulkText = $state('');
	let showBulk = $state(false);

	async function submit(what: 'single' | 'bulk') {
		formError = '';
		if (!session.user) return;
		saving = true;
		try {
			if (what === 'single') {
				const b = buildSafe(values, FIELDS);
				if (b.error || !b.body) throw new Error(b.error ?? tr('form_required_missing'));
				const body = b.body as Record<string, unknown>;
				const pos = body.positions as number[];
				const from = body.fromResidues as string[];
				const to = body.toResidues as string[];
				if (!pos?.length || pos.length !== from?.length || pos.length !== to?.length) {
					throw new Error(tr('me_length_mismatch'));
				}
				await mutationEffects.create(body);
				toastOk(tr('submit_created'));
				showCreate = false;
			} else {
				const recs = csvRecords(bulkText);
				if (!values.sequenceId) throw new Error(tr('form_required_missing'));
				const r = await mutationEffects.bulk(recs);
				toastOk(`${tr('me_bulk_created')} ${r.created} · ${tr('me_bulk_failed')} ${r.failedCount}`);
				if (r.failed?.length) formError = r.failed.map((f) => `#${f.index}: ${f.error}`).join('\n');
				else showBulk = false;
			}
			await load();
		} catch (e) {
			formError = e instanceof Error ? e.message : String(e);
			toastErr(e);
		} finally {
			saving = false;
		}
	}

	const columns: Column<MutationEffectRow>[] = [
		{ key: 'id', label: tr('col_id') },
		{ key: 'sequenceId', label: tr('f_sequenceId'), format: (r) => String(r.sequenceId ?? '').slice(0, 18) + '…' },
		{ key: 'positions', label: tr('f_positions'), format: (r) => (r.positions ?? []).join(', ') },
		{ key: 'fromResidues', label: 'from', format: (r) => (r.fromResidues ?? []).join('') },
		{ key: 'toResidues', label: 'to', format: (r) => (r.toResidues ?? []).join('') },
		{ key: 'effectClass', label: tr('f_effectClass'), format: (r) => enumLabel('ec', r.effectClass) },
		{ key: 'dgValue', label: 'ΔΔG', format: (r) => (r.dgValue != null ? Number(r.dgValue).toFixed(2) : '—') },
		{ key: 'createdAt', label: tr('f_createdAt'), format: (r) => fmtTime(r.createdAt) }
	];
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h1 class="text-2xl font-bold">{tr('browse_mutation_effects')}</h1>
		<PageTools withPrint={false} />
		{#if session.signedIn}
			<div class="flex gap-2">
				<Button size="sm" onclick={() => (showCreate = true)}>{tr('common_create')}</Button>
				<Button size="sm" variant="outline" onclick={() => (showBulk = true)}>{tr('me_bulk')}</Button>
			</div>
		{/if}
	</div>
	{#if error}<p class="rounded-none border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">{error}</p>{/if}
	{#if loading}<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
	{:else}<DataTable {rows} {columns} hrefFor={(r) => `/mutation-effects/${r.id}`} />{/if}
</div>

<Dialog bind:open={showCreate} title={tr('me_create')} width="max-w-2xl">
	<div class="space-y-3">
		{#if formError}<p class="rounded-none bg-destructive/10 p-2 text-xs text-destructive whitespace-pre-line">{formError}</p>{/if}
		<FormFields fields={FIELDS} bind:values columns={2} />
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (showCreate = false)}>{tr('common_cancel')}</Button>
			<Button onclick={() => submit('single')} disabled={saving}>{tr('common_submit')}</Button>
		</div>
	</div>
</Dialog>

<Dialog bind:open={showBulk} title={tr('me_bulk')} width="max-w-2xl">
	<div class="space-y-3">
		<p class="text-xs text-muted-foreground">{tr('me_bulk_intro')}</p>
		<Field name="me_sequenceId_bulk" label={tr('f_sequenceId')} hint={tr('me_hint_sequence')}>
			<TargetPicker
				entityType="sequence"
				initial={values.sequenceId ? { id: values.sequenceId } : undefined}
				onpick={(h) => (values.sequenceId = h?.id ?? '')}
			/>
		</Field>
		<Textarea name="me_bulk" class="h-48 w-full p-3 text-xs" monospace spellcheck={false} placeholder={'12,A,V,-0.8\n45,G,W'} bind:value={bulkText} />
		{#if formError}<p class="rounded-none bg-amber-50 dark:bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300 whitespace-pre-line">{formError}</p>{/if}
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (showBulk = false)}>{tr('common_cancel')}</Button>
			<Button onclick={() => submit('bulk')} disabled={saving}>{tr('me_bulk_submit')}</Button>
		</div>
	</div>
</Dialog>

<svelte:head><title>{tr('browse_mutation_effects')} · SPD</title></svelte:head>
