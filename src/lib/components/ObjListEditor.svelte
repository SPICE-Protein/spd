<script lang="ts">
	import { tr, fieldLabel } from '$lib/i18n';
	import Button from './Button.svelte';
	import Textarea from './Textarea.svelte';
	import Input from './Input.svelte';
	import { parseVal as coerceVal } from './json-coerce';

	/**
	 * Structured editor for arrays of objects (features, parts, insertion
	 * sites, cross references…). Each item renders one input per declared
	 * sub-field plus free key/value extras for anything the schema leaves
	 * open. Like KVEditor, the bound value stays a JSON string so the
	 * existing buildBody `objectList` branch keeps working untouched.
	 */
	let {
		name,
		value = $bindable(''),
		itemFields = []
	}: {
		name: string;
		value?: string;
		itemFields?: Array<{ key: string; required?: boolean }>;
	} = $props();

	interface Item {
		fixed: Record<string, string>;
		extra: Array<{ k: string; v: string }>;
	}

	let items = $state<Item[]>([]);
	let rawMode = $state(false);
	let lastSerialized = $state('');

	function toStr(v: unknown): string {
		if (typeof v === 'string') return v;
		if (v == null) return '';
		return JSON.stringify(v);
	}

	$effect(() => {
		const v = value;
		if (v === lastSerialized) return;
		lastSerialized = v;
		if (!v || !v.trim()) {
			items = [];
			return;
		}
		try {
			const a = JSON.parse(v) as unknown;
			if (!Array.isArray(a)) {
				rawMode = true;
				return;
			}
			items = a.map((el) => {
				const o = (el && typeof el === 'object' ? el : { value: el }) as Record<string, unknown>;
				const fixed: Record<string, string> = {};
				const extra: Array<{ k: string; v: string }> = [];
				const declared = new Set(itemFields.map((f) => f.key));
				for (const [k, val] of Object.entries(o)) {
					if (declared.has(k)) fixed[k] = toStr(val);
					else extra.push({ k, v: toStr(val) });
				}
				for (const f of itemFields) if (!(f.key in fixed)) fixed[f.key] = '';
				return { fixed, extra };
			});
		} catch {
			rawMode = true;
		}
	});

	// Shared coercion (json-coerce); here a blank cell means "no value" so
	// the key drops out of the serialized object.
	function parseVal(s: string): unknown {
		return coerceVal(s, undefined);
	}

	function serialize() {
		const out = items
			.map((it) => {
				const o: Record<string, unknown> = {};
				for (const f of itemFields) {
					const v = parseVal(it.fixed[f.key] ?? '');
					if (v !== undefined) o[f.key] = v;
				}
				for (const e of it.extra) {
					if (!e.k.trim()) continue;
					const v = parseVal(e.v);
					o[e.k.trim()] = v === undefined ? '' : v;
				}
				return o;
			})
			.filter((o) => Object.keys(o).length > 0);
		const s = out.length ? JSON.stringify(out) : '';
		value = s;
		lastSerialized = s;
	}

	function addItem() {
		const fixed: Record<string, string> = {};
		for (const f of itemFields) fixed[f.key] = '';
		items.push({ fixed, extra: [] });
	}
	function removeItem(i: number) {
		items.splice(i, 1);
		serialize();
	}
	function addExtra(i: number) {
		items[i].extra.push({ k: '', v: '' });
	}
	function removeExtra(i: number, j: number) {
		items[i].extra.splice(j, 1);
		serialize();
	}
</script>

<div class="space-y-2">
	{#if rawMode}
		<Textarea name={`${name}-raw`} monospace rows={6} bind:value placeholder={'[{"key":"value"}]'} />
		<div><Button variant="link" size="xs" class="h-auto px-0 text-muted-foreground" onclick={() => (rawMode = false)}>{tr('form_use_rows')}</Button></div>
	{:else}
		{#each items as it, i (i)}
			<div class="rounded-none border p-2">
				<div class="mb-1 flex items-center justify-between">
					<span class="text-xs font-semibold text-muted-foreground">#{i + 1}</span>
					<Button size="xs" variant="ghost" class="px-1.5 text-muted-foreground hover:text-destructive" onclick={() => removeItem(i)} aria_label={tr('form_obj_remove')} title={tr('form_obj_remove')}>×</Button>
				</div>
				<div class="grid grid-cols-1 gap-1.5 md:grid-cols-2">
					{#each itemFields as f (f.key)}
						<label class="block">
							<span class="text-[10px] text-muted-foreground">{fieldLabel(f.key)}{f.required ? ' *' : ''}</span>
							<Input name={`${name}-${i}-${f.key}`} class="mt-0.5 h-9 w-full text-sm" bind:value={it.fixed[f.key]} onchange={serialize} placeholder={f.key} />
						</label>
					{/each}
				</div>
				{#each it.extra as e, j (j)}
					<div class="mt-1.5 flex items-center gap-1.5">
						<Input name={`${name}-${i}-ek${j}`} class="h-9 w-2/5 font-mono text-sm" bind:value={e.k} onchange={serialize} placeholder={tr('form_kv_key')} aria_label={tr('form_kv_key')} />
						<Input name={`${name}-${i}-ev${j}`} class="h-9 min-w-0 flex-1 text-sm" bind:value={e.v} onchange={serialize} placeholder={tr('form_kv_value')} aria_label={tr('form_kv_value')} />
						<Button size="xs" variant="ghost" class="px-1.5 text-muted-foreground hover:text-destructive" onclick={() => removeExtra(i, j)} aria_label={tr('form_kv_remove')} title={tr('form_kv_remove')}>×</Button>
					</div>
				{/each}
				<div class="mt-1">
					<Button variant="link" size="xs" class="h-auto px-0 text-muted-foreground" onclick={() => addExtra(i)}>{tr('form_obj_add_field')}</Button>
				</div>
			</div>
		{/each}
		<div class="flex items-center gap-3">
			<Button size="xs" variant="outline" onclick={addItem}>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3v10M3 8h10" /></svg>
				{tr('form_obj_add')}
			</Button>
			<Button variant="link" size="xs" class="h-auto px-0 text-muted-foreground" onclick={() => (rawMode = true)}>{tr('form_use_raw_json')}</Button>
		</div>
	{/if}
</div>
