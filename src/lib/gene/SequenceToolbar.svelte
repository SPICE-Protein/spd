<script lang="ts">
  import * as m from '$lib/paraglide/messages.js';
  import Button from '../components/Button.svelte';
  import { Separator } from '$lib/components/ui/separator';

  import { Scissors, Milestone, Dna } from '@lucide/svelte';

  type Props = {
    showEnzymes: boolean;
    showFeatures: boolean;
    showTranslations: boolean;
    /** Protein chains have no cut sites and translate from nothing: the
     * corresponding toggles leave the toolbar in protein mode. */
    proteinMode?: boolean;
  };
  let {
    showEnzymes = $bindable(true),
    showFeatures = $bindable(true),
    showTranslations = $bindable(false),
    proteinMode = false
  }: Props = $props();
</script>

<!-- Display toggles only — SPD's viewers are read-only, so the GUI's
     browse/edit/annotate mode switcher and note tool are intentionally absent -->
<div class="flex w-11 flex-col items-center gap-1 border-r bg-muted/40 p-1">
  {#if !proteinMode}
    <Button size="xs" variant={showEnzymes ? 'secondary' : 'ghost'} class="size-8 p-0" onclick={() => (showEnzymes = !showEnzymes)} title={m.viewShowCutSites()}>
      <Scissors size={16} />
    </Button>
  {/if}
  <Button size="xs" variant={showFeatures ? 'secondary' : 'ghost'} class="size-8 p-0" onclick={() => (showFeatures = !showFeatures)} title={m.viewShowFeatures()}>
    <Milestone size={16} />
  </Button>
  {#if !proteinMode}
    <Button size="xs" variant={showTranslations ? 'secondary' : 'ghost'} class="size-8 p-0" onclick={() => (showTranslations = !showTranslations)} title={m.viewShowTranslations()}>
      <Dna size={16} />
    </Button>
  {/if}
  <Separator class="my-1 w-6" />
  <span class="text-[9px] text-muted-foreground">{m.gene_readonly_badge()}</span>
</div>
