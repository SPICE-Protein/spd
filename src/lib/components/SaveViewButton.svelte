<script lang="ts">
	/**
	 * Save the current catalog URL as a named view.
	 *
	 * The default path is read on click, never at module load: this component
	 * is server-rendered too, where `window` does not exist. The name is asked
	 * for in a normal dialog rather than `window.prompt` — blocking browser
	 * prompts are unsupported in embedded webviews and cannot be styled.
	 */
	import { browser } from '$app/environment';
	import { tr } from '$lib/i18n';
	import { toastOk } from '$lib/state/toast.svelte';
	import { savedViews } from '$lib/state/saved-views.svelte';
	import Dialog from './Dialog.svelte';
	import Button from './Button.svelte';
	import Input from './Input.svelte';

	let { path = undefined, label = tr('view_save') }: { path?: string; label?: string } = $props();

	let open = $state(false);
	let name = $state('');
	let target = $state('');

	function currentPath(): string | null {
		const explicit = path?.trim();
		if (explicit) return explicit;
		if (!browser) return null;
		return window.location.pathname + window.location.search;
	}

	function save(): void {
		const next = currentPath();
		if (!next) return;
		target = next;
		name = (typeof document !== 'undefined' ? document.title : '').trim() || next;
		open = true;
	}

	function commit(): void {
		const trimmed = name.trim();
		if (!trimmed) return;
		savedViews.add({ name: trimmed, path: target });
		toastOk(tr('view_saved'));
		open = false;
	}
</script>

<button
	type="button"
	class="inline-flex h-7 items-center gap-1.5 border border-input bg-background px-2.5 text-xs font-medium hover:bg-accent"
	onclick={save}
>
	{label}
</button>

<Dialog bind:open title={label} width="max-w-md">
	<div class="space-y-3">
		<label class="block text-sm">
			<span class="text-xs text-muted-foreground">{label}</span>
			<Input name="view_name" bind:value={name} class="mt-1 w-full" />
		</label>
		<p class="font-mono text-[11px] text-muted-foreground">{target}</p>
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (open = false)}>{tr('common_cancel')}</Button>
			<Button onclick={commit} disabled={!name.trim()}>{tr('common_save')}</Button>
		</div>
	</div>
</Dialog>
