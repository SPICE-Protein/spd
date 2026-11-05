<script lang="ts">
	import { tr } from '$lib/i18n';
	import { enumLabel } from '$lib/i18n';
	import Field from './Field.svelte';
	import Input from './Input.svelte';
	import Textarea from './Textarea.svelte';
	import Select from './Select.svelte';
	import KVEditor from './KVEditor.svelte';
	import ObjListEditor from './ObjListEditor.svelte';
	import TargetPicker from './TargetPicker.svelte';
	import UploadPicker from './UploadPicker.svelte';
	import OrganismField from './OrganismField.svelte';
	import CorrectionItems from './CorrectionItems.svelte';
	import { fetchTargetFields, type TargetFields } from '$lib/submit/field-options';
	import type { FormField, FieldKind } from './form';
	import { validateFields } from './form-values';
	import { wasAttempted as attempted } from '$lib/state/form-attempts.svelte';
	import Checkbox from './Checkbox.svelte';

	let {
		fields,
		values = $bindable({}),
		errors = {},
		columns = 1
	}: {
		fields: FormField[];
		values?: Record<string, string>;
		errors?: Record<string, string>;
		columns?: 1 | 2;
	} = $props();

	function selectOptions(f: FormField) {
		return (f.options ?? []).map((o) =>
			typeof o === 'string' ? { value: o, label: f.ns ? enumLabel(f.ns, o) : o } : o
		);
	}

	// Inline validation without a page having to wire anything: a field complains
	// once it has been touched (or once a submit named it), never before. Long
	// forms used to stay silent until the whole payload failed, then show one
	// sentence at the top — which is how contributors lose ten minutes hunting
	// the offending box.
	let touched = $state<Record<string, boolean>>({});
	const live = $derived(validateFields(values, fields));
	const attemptedOnce = $derived(attempted(values));
	function shown(f: FormField): string | undefined {
		if (errors[f.name]) return errors[f.name];
		// touched inline, or everything after a rejected submit
		return touched[f.name] || attemptedOnce ? live[f.name] : undefined;
	}

	// the organism name slot lives in the companion key when there is one,
	// in a throwaway key when the record stores only a taxId — a conditional
	// member expression is not a legal bind target, so route through get/set
	function organismName(f: FormField): string {
		return f.companion ? String(values[f.companion] ?? '') : String(values[`__organismName_${f.name}`] ?? '');
	}
	function setOrganismName(f: FormField, v: string) {
		if (f.companion) values[f.companion] = v;
		else values[`__organismName_${f.name}`] = v;
	}

	// Svelte 5 throws `props_invalid_value` when a bindable prop with a
	// fallback receives undefined (`bind:value={values[name]}` on a key the
	// page never seeded). A pre-effect seeds every field key BEFORE the
	// children mount (pre-effects run ahead of the DOM-update phase that
	// creates them), and re-seeds whenever `fields` or `values` change —
	// so no editor can ship a half-initialized values object.
	$effect.pre(() => {
		for (const f of fields) {
			if (values[f.name] === undefined) values[f.name] = '';
			if (f.companion && values[f.companion] === undefined) values[f.companion] = '';
			// organism without a companion still needs its throwaway name slot
			if (f.kind === 'organism' && !f.companion && values[`__organismName_${f.name}`] === undefined)
				values[`__organismName_${f.name}`] = '';
		}
	});

	const wideKind = (k: FieldKind) =>
		k === 'textarea' || k === 'json' || k === 'objectList' || k === 'multiPick' || k === 'artifactPick' || k === 'organism' || k === 'fieldPatch';

	// A fieldPatch editor asserts fields of the record picked by `itemsOf`,
	// so once that target is known we fetch its top-level keys (and current
	// values) to feed the datalist. Keyed by "type|id" so re-picking the
	// same record doesn't refetch; failures degrade to free typing.
	const patchOptions = $state<Record<string, TargetFields>>({});
	const patchKey = $state<Record<string, string>>({});
	$effect(() => {
		for (const f of fields) {
			if ((f.kind ?? 'text') !== 'fieldPatch') continue;
			const target = f.itemsOf ? String(values[f.itemsOf] ?? '') : '';
			const ttype = f.itemsOf ? String(values['__targetType_' + f.itemsOf] ?? '') : '';
			const key = `${ttype}|${target}`;
			if (!target || patchKey[f.name] === key) continue;
			patchKey[f.name] = key;
			void fetchTargetFields(ttype || undefined, target).then((r) => {
				patchOptions[f.name] = r;
			});
		}
	});
</script>

<div class={columns === 2 ? 'grid grid-cols-1 gap-3 md:grid-cols-2' : 'space-y-3'}>
	{#each fields as f (f.name)}
		{@const kind = f.kind ?? 'text'}
		{@const wide = wideKind(kind) || !!f.picker}
		<!-- focusout bubbles, so one handler on the wrapper marks the field touched
		     whichever control inside it (input, select, editor) lost the caret -->
		<div
			class={columns === 2 && wide ? 'md:col-span-2' : ''}
			onfocusout={() => (touched[f.name] = true)}
		>
			<Field name={f.name} label={f.label} hint={f.hint} error={shown(f)} required={f.required}>
				{#if f.picker}
					<TargetPicker
						entityType={f.picker === '*' ? undefined : f.picker}
						initial={values[f.name] ? { id: values[f.name], label: f.pickerLabel } : undefined}
						onpick={(h) => {
							values[f.name] = h?.id ?? '';
							// remember WHICH type was picked — a fieldPatch editor
							// downstream needs it to fetch the target's fields
							values['__targetType_' + f.name] = h?.entityType ?? '';
						}}
					/>
				{:else if kind === 'text'}
					<Input name={f.name} bind:value={values[f.name]} placeholder={f.placeholder ?? ''} />
				{:else if kind === 'number'}
					<Input name={f.name} type="number" step="any" bind:value={values[f.name]} placeholder={f.placeholder ?? ''} />
				{:else if kind === 'textarea'}
					<Textarea name={f.name} bind:value={values[f.name]} rows={f.rows ?? 5} placeholder={f.placeholder ?? ''} />
				{:else if kind === 'json'}
					<KVEditor name={f.name} bind:value={values[f.name]} />
				{:else if kind === 'objectList'}
					<ObjListEditor name={f.name} bind:value={values[f.name]} itemFields={f.itemFields ?? []} />
				{:else if kind === 'list' || kind === 'intList'}
					<Input name={f.name} bind:value={values[f.name]} placeholder={f.placeholder ?? tr('form_hint_comma_list')} />
				{:else if kind === 'multiPick' || kind === 'artifactPick'}
					<UploadPicker
						bind:value={values[f.name]}
						multiple={kind === 'multiPick'}
						kinds={f.pickKinds}
						defaultKind={f.uploadDefaultKind ?? 'raw_assay_data'}
					/>
				{:else if kind === 'organism'}
					<OrganismField name={organismName(f)} onname={(v) => setOrganismName(f, v)} bind:taxId={values[f.name]} />
				{:else if kind === 'fieldPatch'}
					<CorrectionItems name={f.name} bind:value={values[f.name]} fieldOptions={patchOptions[f.name] ?? { keys: [], scalars: {} }} />
				{:else if kind === 'select'}
					<Select name={f.name} bind:value={values[f.name]} options={selectOptions(f)} placeholder="" />
				{:else if kind === 'checkbox'}
					<label class="flex items-center gap-2 text-sm">
						<Checkbox name={f.name} checked={values[f.name] === 'true'} onchange={(c) => (values[f.name] = c ? 'true' : 'false')} />
						{tr(`f_${f.name}`)}
					</label>
				{/if}
			</Field>
		</div>
	{/each}
</div>
