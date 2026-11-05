<script lang="ts">
	/**
	 * Citation formats for one record, each copyable on its own.
	 *
	 * The record is built by RecordActions when the menu item is chosen, so the
	 * access date is fixed at that moment instead of drifting on every render.
	 * BibTeX is also offered as a file because that is what reference managers
	 * import without a clipboard round-trip.
	 */
	import Dialog from './Dialog.svelte';
	import Button from './Button.svelte';
	import { tr } from '$lib/i18n';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import { downloadText } from '$lib/export/download';
	import { citationPlain, citationBibtex, citationRis, type CitationRecord } from '$lib/citation';

	let {
		open = $bindable(false),
		record,
		filename = undefined
	}: {
		open?: boolean;
		record: CitationRecord;
		filename?: string;
	} = $props();

	const plain = $derived(citationPlain(record));
	const bibtex = $derived(citationBibtex(record));
	const ris = $derived(citationRis(record));

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toastOk(tr('common_copied'));
		} catch {
			toastErr(tr('upload_clipboard_fail'));
		}
	}

	function downloadBib() {
		downloadText(filename ?? `${record.name}.bib`, bibtex, 'application/x-bibtex;charset=utf-8');
		toastOk(tr('exportSaved'));
	}
</script>

<Dialog bind:open title={tr('action_citation')} width="max-w-2xl">
	<div class="space-y-4">
		<section>
			<div class="mb-1 flex items-center justify-between gap-2">
				<span class="text-xs font-semibold text-muted-foreground">Plain text</span>
				<Button size="xs" variant="outline" onclick={() => void copy(plain)}
					>{tr('common_copy')}</Button
				>
			</div>
			<pre
				class="max-h-32 overflow-auto border border-border bg-muted/40 p-2 font-mono text-xs leading-5">{plain}</pre>
		</section>

		<section>
			<div class="mb-1 flex items-center justify-between gap-2">
				<span class="text-xs font-semibold text-muted-foreground">BibTeX</span>
				<div class="flex gap-2">
					<Button size="xs" variant="outline" onclick={() => void copy(bibtex)}
						>{tr('action_copy_bibtex')}</Button
					>
					<Button size="xs" variant="ghost" onclick={downloadBib}
						>{tr('action_download_bibtex')}</Button
					>
				</div>
			</div>
			<pre
				class="max-h-40 overflow-auto border border-border bg-muted/40 p-2 font-mono text-xs leading-5">{bibtex}</pre>
		</section>

		<section>
			<div class="mb-1 flex items-center justify-between gap-2">
				<span class="text-xs font-semibold text-muted-foreground">RIS</span>
				<Button size="xs" variant="outline" onclick={() => void copy(ris)}
					>{tr('action_copy_ris')}</Button
				>
			</div>
			<pre
				class="max-h-32 overflow-auto border border-border bg-muted/40 p-2 font-mono text-xs leading-5">{ris}</pre>
		</section>

		<div class="flex justify-end">
			<Button variant="ghost" onclick={() => (open = false)}>{tr('common_close')}</Button>
		</div>
	</div>
</Dialog>
