<script lang="ts">
	/**
	 * One export affordance for a record. Formats are lazy closures so a page
	 * never pays for the GenBank reader stack until the user picks a format.
	 *
	 * The menu is fixed-positioned and clamped to the viewport: export buttons
	 * sit on both the left (record headers) and right (tab toolbars) edges, and
	 * a plain `absolute right-0` pushes the labels off-screen on the left one.
	 */
	import { tick } from 'svelte';
	import { tr } from '$lib/i18n';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import { downloadText } from '$lib/export/download';
	import type { ExportFormat } from '$lib/export/types';

	let { formats, label = tr('export_label') }: { formats: ExportFormat[]; label?: string } =
		$props();

	let open = $state(false);
	let busy = $state('');
	let buttonEl = $state<HTMLButtonElement>();
	let menuEl = $state<HTMLDivElement>();
	let position = $state({ left: 0, top: 0, width: 208 });

	async function toggle() {
		open = !open;
		if (!open) return;
		await tick();
		if (!buttonEl || !menuEl) return;
		const pad = 8;
		const width = Math.min(menuEl.offsetWidth || 208, window.innerWidth - pad * 2);
		const anchor = buttonEl.getBoundingClientRect();
		let left = anchor.left;
		if (left + width > window.innerWidth - pad) left = anchor.right - width;
		left = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
		let top = anchor.bottom + 4;
		const height = menuEl.offsetHeight;
		if (top + height > window.innerHeight - pad) {
			top = Math.max(pad, anchor.top - height - 4);
		}
		position = { left, top, width };
	}

	async function pick(format: ExportFormat) {
		if (format.disabled || busy) return;
		busy = format.key;
		try {
			const text = await format.build();
			downloadText(format.filename, text, format.mime);
			toastOk(tr('exportSaved'));
			open = false;
		} catch (e) {
			toastErr(e instanceof Error ? e : new Error(tr('exportFailed')));
		} finally {
			busy = '';
		}
	}
</script>

<div data-print-hide class="relative inline-block text-left">
	<button
		bind:this={buttonEl}
		type="button"
		class="inline-flex h-7 items-center gap-1.5 border border-input bg-background px-2.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
		aria-expanded={open}
		aria-haspopup="menu"
		disabled={busy !== ''}
		onclick={toggle}
	>
		{busy ? tr('export_working') : label}
		<span class="text-muted-foreground" aria-hidden="true">▾</span>
	</button>
	{#if open}
		<div class="fixed inset-0 z-20" aria-hidden="true" onclick={() => (open = false)}></div>
		<div
			bind:this={menuEl}
			class="fixed z-30 border border-border bg-background p-1 shadow-lg"
			role="menu"
			style="left: {position.left}px; top: {position.top}px; width: {position.width}px;"
		>
			{#each formats as format (format.key)}
				<button
					type="button"
					class="block w-full px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-40"
					role="menuitem"
					disabled={format.disabled || busy !== ''}
					onclick={() => void pick(format)}
				>
					{format.label}
				</button>
			{/each}
		</div>
	{/if}
</div>
