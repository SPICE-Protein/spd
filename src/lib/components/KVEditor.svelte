<script lang="ts">
	import { tr } from '$lib/i18n';
	import Input from './Input.svelte';
	import Textarea from './Textarea.svelte';
	import Button from './Button.svelte';
	import { parseVal } from './json-coerce';

	/**
	 * Structured editor for free-shape JSON objects. Users type key/value
	 * rows; dotted keys (`ionConcentrations.Na`) nest into sub-objects, and
	 * values auto-read as number/bool/JSON when they parse. The bound value
	 * stays a JSON string so buildBody's `json` branch is untouched — the
	 * raw-JSON panel is kept for exports from other tools.
	 */
	let {
		name,
		value = $bindable('')
	}: {
		name: string;
		value?: string;
	} = $props();

	interface Row {
		k: string;
		v: string;
	}

	let rows = $state<Row[]>([]);
	let rawMode = $state(false);
	let lastSerialized = $state('');

	function flatten(obj: Record<string, unknown>, prefix = ''): Row[] {
		const out: Row[] = [];
		for (const [k, v] of Object.entries(obj)) {
			if (v && typeof v === 'object' && !Array.isArray(v)) {
				out.push(...flatten(v as Record<string, unknown>, prefix + k + '.'));
			} else {
				out.push({ k: prefix + k, v: typeof v === 'string' ? v : JSON.stringify(v ?? '') });
			}
		}
		return out;
	}

	function setPath(o: Record<string, unknown>, dotted: string, val: unknown) {
		const parts = dotted.split('.').filter(Boolean);
		if (!parts.length) return;
		let cur = o;
		for (let i = 0; i < parts.length - 1; i++) {
			const p = parts[i];
			if (!cur[p] || typeof cur[p] !== 'object' || Array.isArray(cur[p])) cur[p] = {};
			cur = cur[p] as Record<string, unknown>;
		}
		cur[parts[parts.length - 1]] = val;
	}

	// Re-seed rows from an externally-set value (file load, reset after
	// submit) but never echo our own serialization back into the inputs.
	$effect(() => {
		const v = value;
		if (v === lastSerialized) return;
		lastSerialized = v;
		if (!v || !v.trim()) {
			rows = [];
			return;
		}
		try {
			const o = JSON.parse(v) as unknown;
			if (o && typeof o === 'object' && !Array.isArray(o)) rows = flatten(o as Record<string, unknown>);
			else rawMode = true;
		} catch {
			rawMode = true;
			rows = [];
		}
	});

	function serialize() {
		const filled = rows.filter((r) => r.k.trim());
		if (!filled.length) {
			value = '';
			lastSerialized = '';
			return;
		}
		const o: Record<string, unknown> = {};
		for (const r of filled) setPath(o, r.k.trim(), parseVal(r.v));
		const s = JSON.stringify(o);
		value = s;
		lastSerialized = s;
	}

	function addRow() {
		rows.push({ k: '', v: '' });
	}
	function removeRow(i: number) {
		rows.splice(i, 1);
		serialize();
	}
</script>

<div class="space-y-1.5">
	{#if rawMode}
		<Textarea name={`${name}-raw`} monospace rows={5} bind:value placeholder={'{"key": "value"}'} />
		<div>
			<Button variant="link" size="xs" class="h-auto px-0 text-muted-foreground" onclick={() => (rawMode = false)}>{tr('form_use_rows')}</Button>
		</div>
	{:else}
		{#each rows as r, i (i)}
			<div class="flex items-center gap-1.5">
				<Input name={`${name}-k${i}`} class="h-9 w-2/5 font-mono text-sm" bind:value={r.k} onchange={serialize} placeholder={tr('form_kv_key')} aria_label={tr('form_kv_key')} />
				<div class="min-w-0 flex-1">
					<Input name={`${name}-${i}`} bind:value={r.v} onchange={serialize} placeholder={tr('form_kv_value')} />
				</div>
				<Button size="xs" variant="ghost" class="px-1.5 text-muted-foreground hover:text-destructive" onclick={() => removeRow(i)} aria_label={tr('form_kv_remove')} title={tr('form_kv_remove')}>×</Button>
			</div>
		{/each}
		<div class="flex items-center gap-3">
			<Button size="xs" variant="outline" onclick={() => { addRow(); }}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3v10M3 8h10" /></svg>{tr('form_kv_add')}</Button>
			<Button variant="link" size="xs" class="h-auto px-0 text-muted-foreground" onclick={() => (rawMode = true)}>{tr('form_use_raw_json')}</Button>
		</div>
	{/if}
</div>
