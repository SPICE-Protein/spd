<script lang="ts">
	import { fieldLabel, tr } from '$lib/i18n';
	import Input from './Input.svelte';
	import Textarea from './Textarea.svelte';
	import Button from './Button.svelte';
	import Select from './Select.svelte';
	import InfoTip from './InfoTip.svelte';
	import { parseVal, cellText } from './json-coerce';
	import type { TargetFields } from '$lib/submit/field-options';

	/**
	 * The field-level assertion editor: one row per field a correction
	 * claims about its target record — WHICH field, the value as the filer
	 * sees it, the value being proposed, and an optional note.
	 *
	 * The field is a picker, not free text: the parent fetched the target's
	 * real keys, and each option shows both the human label and the wire key
	 * so nobody has to guess whether the page calls it "CAS number" or
	 * `casNumber`. "Other field" keeps the old escape hatch for a key the
	 * projection renamed or hid; the server only requires a non-empty string.
	 *
	 * Like the other row editors the bound value stays a JSON string — the
	 * `fieldPatch` buildBody branch just parses it. `proposed` is always
	 * serialized when a row has a field name (blank means "propose empty"),
	 * matching the server contract: the key must be PRESENT.
	 */
	let {
		name,
		value = $bindable(''),
		fieldOptions = { keys: [], scalars: {} }
	}: {
		name: string;
		value?: string;
		fieldOptions?: TargetFields;
	} = $props();

	const CUSTOM = '__custom__';
	interface Row {
		field: string;
		current: string;
		proposed: string;
		note: string;
		custom: boolean;
	}

	const blank = (): Row => ({ field: '', current: '', proposed: '', note: '', custom: false });

	let rows = $state<Row[]>([blank()]);
	let rawMode = $state(false);
	let lastSerialized = $state('');

	const fieldSelectOptions = $derived([
		...fieldOptions.keys.map((k) => ({
			value: k,
			label: `${fieldLabel(k)} · ${k}`
		})),
		{ value: CUSTOM, label: tr('ci_field_custom') }
	]);

	function pickValue(r: Row) {
		if (!r.field) return r.custom ? CUSTOM : '';
		return fieldOptions.keys.includes(r.field) ? r.field : CUSTOM;
	}

	function isCustom(r: Row) {
		return r.custom || (!!r.field && !fieldOptions.keys.includes(r.field));
	}

	$effect(() => {
		const v = value;
		if (v === lastSerialized) return;
		lastSerialized = v;
		if (!v || !v.trim()) {
			rows = [blank()];
			return;
		}
		try {
			const a = JSON.parse(v) as unknown;
			if (!Array.isArray(a)) {
				rawMode = true;
				return;
			}
			rows = a.map((el) => {
				const o = (el && typeof el === 'object' ? el : {}) as Record<string, unknown>;
				return {
					field: typeof o.field === 'string' ? o.field : '',
					current: cellText(o.current),
					proposed: cellText(o.proposed),
					note: typeof o.note === 'string' ? o.note : '',
					custom: false
				};
			});
			if (!rows.length) rows = [blank()];
		} catch {
			rawMode = true;
			rows = [];
		}
	});

	function serialize() {
		const filled = rows.filter((r) => r.field.trim());
		if (!filled.length) {
			value = '';
			lastSerialized = '';
			return;
		}
		const out = filled.map((r) => {
			const item: Record<string, unknown> = {
				field: r.field.trim(),
				proposed: parseVal(r.proposed)
			};
			if (r.current.trim()) item.current = parseVal(r.current);
			if (r.note.trim()) item.note = r.note.trim();
			return item;
		});
		const s = JSON.stringify(out);
		value = s;
		lastSerialized = s;
	}

	function onFieldPick(r: Row, next: string) {
		if (next === CUSTOM) {
			// Keep whatever the filer already typed; editing the custom key
			// below is a separate step.
			r.custom = true;
			if (fieldOptions.keys.includes(r.field)) r.field = '';
			serialize();
			return;
		}
		r.custom = false;
		r.field = next;
		// Choosing a field the target actually has pre-bills its current
		// value — but never overwrites something the filer already typed.
		const known = fieldOptions.scalars[next];
		if (known !== undefined && !r.current.trim()) r.current = known;
		serialize();
	}

	function addRow() {
		rows.push(blank());
	}
	function removeRow(i: number) {
		rows.splice(i, 1);
		if (!rows.length) rows.push(blank());
		serialize();
	}
</script>

<div class="space-y-2">
	{#if rawMode}
		<Textarea
			name={`${name}-raw`}
			monospace
			rows={5}
			bind:value
			placeholder={'[{"field":"geneName","proposed":"lyz1"}]'}
		/>
		<div>
			<Button
				variant="link"
				size="xs"
				class="h-auto px-0 text-muted-foreground"
				onclick={() => (rawMode = false)}>{tr('form_use_rows')}</Button
			>
		</div>
	{:else}
		{#if fieldOptions.loading}
			<p class="text-xs text-muted-foreground">{tr('ci_fields_loading')}</p>
		{/if}
		{#each rows as r, i (i)}
			<div class="space-y-2 rounded-none border bg-muted/20 p-2.5">
				<div class="flex items-start gap-2">
					<div class="min-w-0 flex-1">
						<span class="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
							{tr('ci_field')}
							<InfoTip
								text={tr('ci_hint')}
								label={`${tr('ci_field')} — ${tr('common_more_info')}`}
							/>
						</span>
						<Select
							name={`${name}-f${i}`}
							class="mt-1 h-9"
							value={pickValue(r)}
							options={fieldSelectOptions}
							placeholder={tr('ci_field_placeholder')}
							disabled={fieldOptions.loading}
							onchange={(v) => onFieldPick(r, v)}
						/>
					</div>
					<Button
						size="xs"
						variant="ghost"
						class="mt-5 px-1.5 text-muted-foreground hover:text-destructive"
						onclick={() => removeRow(i)}
						aria_label={tr('form_kv_remove')}
						title={tr('form_kv_remove')}>×</Button
					>
				</div>
				{#if isCustom(r)}
					<label class="block">
						<span class="text-[11px] text-muted-foreground">{tr('ci_field_key')}</span>
						<Input
							name={`${name}-fk${i}`}
							class="mt-1 h-9 w-full font-mono text-sm"
							bind:value={r.field}
							onchange={serialize}
							placeholder={tr('ci_field_custom_placeholder')}
							aria_label={tr('ci_field_key')}
						/>
					</label>
				{/if}
				<div class="grid gap-2 sm:grid-cols-2">
					<label class="block min-w-0">
						<span class="text-[11px] text-muted-foreground">{tr('ci_current')}</span>
						<Input
							name={`${name}-c${i}`}
							class="mt-1 h-9 w-full"
							bind:value={r.current}
							onchange={serialize}
							placeholder={tr('ci_current_placeholder')}
						/>
					</label>
					<label class="block min-w-0">
						<span class="text-[11px] text-muted-foreground">{tr('ci_proposed')}</span>
						<Input
							name={`${name}-p${i}`}
							class="mt-1 h-9 w-full"
							bind:value={r.proposed}
							onchange={serialize}
							placeholder={tr('ci_proposed_placeholder')}
						/>
					</label>
				</div>
				<label class="block">
					<span class="text-[11px] text-muted-foreground">{tr('ci_note')}</span>
					<Input
						name={`${name}-n${i}`}
						class="mt-1 h-9 w-full"
						bind:value={r.note}
						onchange={serialize}
						placeholder={tr('ci_note_placeholder')}
					/>
				</label>
			</div>
		{/each}
		<div class="flex items-center gap-3">
			<Button size="xs" variant="outline" onclick={addRow}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 16 16"
					class="h-3 w-3"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"><path d="M8 3v10M3 8h10" /></svg
				>
				{tr('ci_add_row')}
			</Button>
			<Button
				variant="link"
				size="xs"
				class="h-auto px-0 text-muted-foreground"
				onclick={() => (rawMode = true)}>{tr('form_use_raw_json')}</Button
			>
		</div>
	{/if}
</div>
