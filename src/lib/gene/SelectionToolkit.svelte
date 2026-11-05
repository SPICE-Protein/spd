<script lang="ts">
  import * as m from '$lib/paraglide/messages.js';
  import Button from '../components/Button.svelte';
  type Props = {
    selectionStart: number;
    selectionEnd: number;
    selectedGcContent: number;
    selectedTm: number | null;
    proteinMode?: boolean;
    /** single-stranded transcript track: units are nucleotides, and there
     * is no melting temperature to quote (the formula melts DNA primers). */
    rnaMode?: boolean;
    selectedGravy?: number | null;
    onCopy: () => void;
    onCopyAsImage: () => void;
    onCancel: () => void;
  };
  let {
    selectionStart = 1,
    selectionEnd = 1,
    selectedGcContent = 0,
    selectedTm = null as number | null,
    proteinMode = false,
    rnaMode = false,
    selectedGravy = null as number | null,
    onCopy = () => {},
    onCopyAsImage = () => {},
    onCancel = () => {}
  }: Props = $props();
</script>

{#if selectionStart !== 1 || selectionEnd !== 1}
<div class="flex items-center gap-1.5 border-b bg-muted/40 px-2.5 py-1 text-xs">
  <span class="text-foreground">
    <span class="font-semibold">{selectionStart}..{selectionEnd}</span>
    = {selectionEnd - selectionStart + 1} {proteinMode ? 'res' : rnaMode ? 'nt' : 'bp'}
    {#if proteinMode}
      {#if selectedGravy !== null}[GRAVY {selectedGravy.toFixed(2)} (viewer)]{/if}
    {:else}
      [{selectedGcContent.toFixed(1)}% GC]
      {#if selectedTm !== null} | Tm = {selectedTm}&deg;C{/if}
    {/if}
  </span>
  <div class="flex-1"></div>
  <Button size="xs" variant="outline" onclick={onCopy} title={m.tkCopySeqFeat()}>{m.tkCopy()}</Button>
  <Button size="xs" variant="outline" onclick={onCopyAsImage} title={m.tkCopyPng()}>{m.tkCopyImage()}</Button>
  <Button size="xs" variant="ghost" onclick={onCancel} title={m.cancel()}>{m.cancel()}</Button>
</div>
{/if}
