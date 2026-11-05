<script lang="ts">
  import { onMount } from 'svelte';
  import { currentLocale } from './shims';
  import Button from '../components/Button.svelte';
  function t(zh: string, en: string): string {
    return currentLocale.value === 'zh' ? zh : en;
  }
  import * as m from '$lib/paraglide/messages.js';

  import { backend } from './shims';
  import { pushToast } from './shims';
  import { Dna } from '@lucide/svelte';
  import { calculatePercentGC, calculateNebTm } from '$lib/genome';
  // Same amino-acid charset the backend sequence normalizer accepts
  // (spd_backend protein/service.rs normalize_sequence); if the backend
  // vocabulary changes, change both together.
  import { BIOMOLECULE_CHARS } from '$lib/format';
  import { gravy } from './utils/proteinView';

  import SequenceRow from './SequenceRow.svelte';
  import SequenceMinimap from './SequenceMinimap.svelte';
  import SequenceToolbar from './SequenceToolbar.svelte';
  import SelectionToolkit from './SelectionToolkit.svelte';
  import { getCutsiteLabelHeight, getAnnotationLabelHeight, getAnnotationStackHeight, drawSequenceRowOnCanvas, calculateRowYOffsets } from './utils/rowRender';

  let {
    dnaSeq = $bindable(''),
    plasmidName = $bindable(''),
    codonHost = $bindable('ecoli'),
    quickDbId = $bindable(''),
    translatedProtein = '',
    restrictionSites = [] as { name: string; pos: number; seq: string; color: string; methylated?: boolean; methylationType?: string }[],
    geneFeatures = $bindable([] as { id: number; name: string; start: number; end: number; type: string; color: string; forward?: boolean; description?: string; residue?: string }[]),
    parts = [] as { name: string; start: number; end: number }[],
    primers = [] as { name: string; start: number; end: number; forward?: boolean }[],
    selectionStart = $bindable(1),
    selectionEnd = $bindable(1),
    showSingleStrand = false,
    colorTheme = 'monochrome',
    modifiedRanges = [] as { start: number; end: number }[],
    showEnzymes = $bindable(true),
    showFeatures = $bindable(true),
    showTranslations = $bindable(true),
    mode = 'dna' as 'dna' | 'protein' | 'rna',
    assertedMass = null as number | null,
    assertedCrc64 = null as string | null
  } = $props<{
    dnaSeq: string;
    plasmidName: string;
    codonHost?: 'ecoli' | 'yeast' | 'human';
    quickDbId?: string;
    translatedProtein?: string;
    restrictionSites: { name: string; pos: number; seq: string; color: string; methylated?: boolean; methylationType?: string }[];
    geneFeatures: { id: number; name: string; start: number; end: number; type: string; color: string; forward?: boolean; description?: string; residue?: string }[];
    parts: { name: string; start: number; end: number }[];
    primers: { name: string; start: number; end: number; forward?: boolean }[];
    selectionStart?: number;
    selectionEnd?: number;
    showSingleStrand?: boolean;
    colorTheme?: string;
    modifiedRanges?: { start: number; end: number }[];
    showEnzymes?: boolean;
    showFeatures?: boolean;
    showTranslations?: boolean;
    /** 'protein' renders an amino-acid chain: single strand, residue units,
     * aa color themes, no enzymes/translations (defaults keep DNA).
     * 'rna' renders a single-stranded nucleotide chain over the RNA alphabet
     * (U instead of T) — no restriction rails, no reading frames: an asserted
     * transcript is not a template for the viewer to translate. */
    mode?: 'dna' | 'protein' | 'rna';
    /** Source-asserted mass (Da) shown as an assertion in the status bar —
     * the viewer displays what the record quotes, computes nothing. */
    assertedMass?: number | null;
    assertedCrc64?: string | null;
  }>();

  const isProtein = $derived(mode === 'protein');
  const isRna = $derived(mode === 'rna');
  // Effective display toggles: a protein chain is single-stranded, has no
  // restriction sites, and translates nothing — the DNA toggles stay as-is.
  // An RNA track is the same story minus the residues: cutters do not act on
  // it (§56 keeps them off this track by row), and SPD never transcribes or
  // translates — the transcript is an assertion, not a template.
  const enzymesOn = $derived(!isProtein && !isRna && showEnzymes);
  const transOn = $derived(!isProtein && !isRna && showTranslations);
  const singleStrand = $derived(isProtein || isRna || showSingleStrand);

  let isFetching = $state(false);
  let isFetchingCodons = $state(false);
  let customTaxId = $state('36329');
  let log: string[] = $state([]);

  // System mobile/pad and force virtual keyboard detection

  // ---------------- Layout Constants ----------------
  const CHAR_W = 9;
  const BLOCK_GAP = 0;
  const BLOCK_SIZE = 10;
  const LEFT_MARGIN = 58;
  const RIGHT_MARGIN = 24;

 let containerEl = $state<HTMLDivElement | null>(null);
 let containerWidth = $state(700);
 let scrollTop = $state(0);
  let viewportH = $state(400);

 const basesPerRow = $derived.by(() => {
   const blockStep = CHAR_W * BLOCK_SIZE + BLOCK_GAP;
   const maxBlocks = Math.floor((containerWidth - LEFT_MARGIN - RIGHT_MARGIN) / blockStep);
    // Round to nearest multiple of 3 so translation reading frames stay aligned across rows
    const raw = Math.max(20, maxBlocks * BLOCK_SIZE);
    // Protein and RNA modes have no reading frames: rows keep block alignment
    // only. (An RNA track is never translated by the viewer either.)
    return isProtein || isRna ? raw : Math.floor(raw / 3) * 3;
 });

  // Character sets mirror the two backend nucleotide alphabets (FEATURE_LIST
  // §55) INCLUDING the IUPAC ambiguity codes: a gene record may assert R/Y/…,
  // and a viewer that stripped those letters would shift every region feature
  // off its asserted coordinates. RNA keeps U and drops T; DNA is the old
  // track, widened from ATCGN to the shared IUPAC alphabet for the same
  // positional-fidelity reason.
  const dna = $derived(
    isProtein
      ? dnaSeq.toUpperCase().replace(new RegExp(`[^${BIOMOLECULE_CHARS}*]`, 'g'), '')
      : isRna
        ? dnaSeq.toUpperCase().replace(/[^ACGURYSWKMBDHVN]/g, '')
        : dnaSeq.toUpperCase().replace(/[^ACGTRYSWKMBDHVN]/g, '')
  );
  const dnaGcContent = $derived(calculatePercentGC(dna));

  const selectedGcContent = $derived.by(() => {
    if (isProtein) return 0;
    if (selectionStart === 1 && selectionEnd === 1) return 0;
    const seg = dnaSeq.slice(selectionStart - 1, selectionEnd);
    if (!seg) return 0;
    return calculatePercentGC(seg);
  });

  const selectedTm = $derived.by(() => {
    // melting math is a DNA-primer formula; an RNA selection gets no Tm
    if (isProtein || isRna) return null;
    if (selectionStart === 1 && selectionEnd === 1) return null;
    const seg = dnaSeq.slice(selectionStart - 1, selectionEnd);
    if (seg.length < 4 || seg.length > 50) return null;
    try {
      const tm = calculateNebTm(seg, { monovalentCationConc: 0.05, primerConc: 0.0000005 });
      return typeof tm === 'number' && !isNaN(tm) ? Math.round(tm) : null;
    } catch { return null; }
  });

  // Display math over what is on screen, labelled "(viewer)" wherever it
  // renders: the mean hydropathy of residues, nothing SPD stores.
  const selectedGravy = $derived.by(() => {
    if (!isProtein) return null;
    if (selectionStart === 1 && selectionEnd === 1) return null;
    const seg = dna.slice(selectionStart - 1, selectionEnd);
    return gravy(seg);
  });

  // Units are what the chain actually is: residues, nucleotides (single
  // strand), or base positions on the classic double-stranded DNA track.
  const unitLabel = $derived(isProtein ? t('残基', 'res') : isRna ? t('核苷', 'nt') : 'bp');

  const rows = $derived.by(() => {
    const list = [];
    const bpr = basesPerRow;
    for (let i = 0; i < dna.length; i += bpr) {
      const rowSeq = dna.slice(i, i + bpr);
      const rowStart = i + 1;
      const rowEnd = Math.min(i + bpr, dna.length);

      const blocks = [];
      for (let j = 0; j < rowSeq.length; j += BLOCK_SIZE) {
        const blockSeq = rowSeq.slice(j, j + BLOCK_SIZE);
        blocks.push({
          blockIdx: j / BLOCK_SIZE,
          bases: blockSeq.split(''),
          startPos: rowStart + j
        });
      }

      list.push({
        rowIdx: i / bpr,
        start: rowStart,
        end: rowEnd,
        blocks
      });
    }
    return list;
  });

  // Pre-calculate heights and absolute top positions for all rows (pure mathematical calculations)
  const rowLayouts = $derived.by(() => {
    let currentTop = 0;
    const layouts = [];

    // Bucketize restriction sites and features by row for O(N + R) speedup (Feature 8)
    const bpr = basesPerRow;
    const rowSitesMap = new Map<number, any[]>();
    const rowFeatsMap = new Map<number, any[]>();
    const rowPartsMap = new Map<number, any[]>();

    if (enzymesOn) {
      restrictionSites.forEach((s: any) => {
        const rIdx = Math.floor((s.pos - 1) / bpr);
        if (!rowSitesMap.has(rIdx)) rowSitesMap.set(rIdx, []);
        rowSitesMap.get(rIdx)!.push(s);
      });
    }

    if (showFeatures) {
      geneFeatures.forEach((f: any) => {
        const startRow = Math.floor((f.start - 1) / bpr);
        const endRow = Math.floor((f.end - 1) / bpr);
        for (let r = startRow; r <= endRow; r++) {
          if (!rowFeatsMap.has(r)) rowFeatsMap.set(r, []);
          rowFeatsMap.get(r)!.push(f);
        }
      });
    }

    parts.forEach((p: any) => {
      const startRow = Math.floor((p.start - 1) / bpr);
      const endRow = Math.floor((p.end - 1) / bpr);
      for (let r = startRow; r <= endRow; r++) {
        if (!rowPartsMap.has(r)) rowPartsMap.set(r, []);
        rowPartsMap.get(r)!.push(p);
      }
    });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      let h = 8; // Top spacer
      h += 22 + 4; // Ruler height + gap

      // Enzyme labels (O(1) Map lookup!)
      const rowSites = rowSitesMap.get(row.rowIdx) || [];
      if (enzymesOn && rowSites.length) {
        h += getCutsiteLabelHeight(rowSites, row) + 2;
      }

      // Selection info bar
      if (selectionStart !== 1 || selectionEnd !== 1) {
        const selStart = Math.max(selectionStart, row.start);
        const selEnd = Math.min(selectionEnd, row.end);
        if (selStart <= selEnd) h += 18;
      }

      // Sequence container
      h += singleStrand ? 24 : 52;

      // Translations
      if (transOn) {
        h += 18;
      }

      // Features (O(1) Map lookup!)
      const rowFeats = rowFeatsMap.get(row.rowIdx) || [];
      if (showFeatures && rowFeats.length) {
        h += getAnnotationLabelHeight(rowFeats, row);
        h += getAnnotationStackHeight(rowFeats) + 5;
      }

      // Parts (O(1) Map lookup!)
      const rowParts = rowPartsMap.get(row.rowIdx) || [];
      if (rowParts.length) {
        h += getAnnotationLabelHeight(rowParts, row);
        h += getAnnotationStackHeight(rowParts) + 5;
      }

      const totalH = h + 16; // bottom padding + margin
      layouts.push({
        row,
        height: totalH,
        top: currentTop
      });
      currentTop += totalH;
    }

    return {
      layouts,
      totalHeight: currentTop
    };
  });

  const visibleRowLayouts = $derived.by(() => {
    const buffer = 400; // px buffer
    const startY = Math.max(0, scrollTop - buffer);
    const endY = scrollTop + viewportH + buffer;

    return rowLayouts.layouts.filter((l) => {
      const bottom = l.top + l.height;
      return l.top <= endY && bottom >= startY;
    });
  });

  let totalContentH = $state(1000);

 onMount(() => {
   // Load persisted custom codon state
   const savedTaxId = localStorage.getItem('spice_custom_tax_id');
   if (savedTaxId) customTaxId = savedTaxId;
   const savedCodonTable = localStorage.getItem('spice_reverse_codon_table');
   if (savedCodonTable) {
     try {
       reverseCodonTable = JSON.parse(savedCodonTable);
     } catch (e) {
       console.error("Error loading persisted reverseCodonTable:", e);
     }
   }

   if (containerEl) {
     const observer = new ResizeObserver(entries => {
       for (const entry of entries) {
         containerWidth = entry.contentRect.width;
          viewportH = entry.contentRect.height;
       }
     });
     observer.observe(containerEl);
     return () => observer.disconnect();
   }
 });

  // Smoothly scroll the container to the selection when selectionStart changes (Gap 17 Scroll Alignment)
  $effect(() => {
    if (selectionStart > 1 && containerEl && rows.length > 0) {
      const targetRow = rows.find(r => selectionStart >= r.start && selectionStart <= r.end);
      if (targetRow) {
        const layout = rowLayouts.layouts.find(l => l.row.rowIdx === targetRow.rowIdx);
        if (layout) {
          containerEl.scrollTo({
            top: Math.max(0, layout.top - 20),
            behavior: 'smooth'
          });
        }
      }
    }
  });

  function pushLog(msg: string) {
    const ts = new Date().toLocaleTimeString();
    log = [...log.slice(-100), `[${ts}] ${msg}`];
  }

  // ---------------- Toolbar State ----------------

  // ---------------- Hover Feature Details ----------------
  let hoveredFeature = $state<any>(null);
  let mouseX = $state(0);
  let mouseY = $state(0);

  function handleMouseMoveContainer(e: MouseEvent) {
    if (hoveredFeature && containerEl) {
      const rect = containerEl.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    }
  }

  // ---------------- Clicked Feature Tooltip (SnapGene-style) ----------------
  let clickedFeature = $state<any>(null);
  let tooltipLeft = $state(0);
  let tooltipTop = $state(0);

  // Draggable Clicked Feature Tooltip State
  let isDraggingTooltip = $state(false);
  let tooltipDragStart = { x: 0, y: 0 };
  let tooltipPositionStart = { left: 0, top: 0 };

  function handleTooltipMouseDown(e: MouseEvent) {
    if (e.button !== 0) return; // Only left click
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.closest('button') || target.closest('input')) {
      return;
    }
    isDraggingTooltip = true;
    tooltipDragStart = { x: e.clientX, y: e.clientY };
    tooltipPositionStart = { left: tooltipLeft, top: tooltipTop };

    window.addEventListener('mousemove', handleTooltipMouseMove);
    window.addEventListener('mouseup', handleTooltipMouseUp);
  }

  function handleTooltipMouseMove(e: MouseEvent) {
    if (!isDraggingTooltip) return;
    const dx = e.clientX - tooltipDragStart.x;
    const dy = e.clientY - tooltipDragStart.y;
    tooltipLeft = tooltipPositionStart.left + dx;
    tooltipTop = tooltipPositionStart.top + dy;
  }

  function handleTooltipMouseUp() {
    isDraggingTooltip = false;
    window.removeEventListener('mousemove', handleTooltipMouseMove);
    window.removeEventListener('mouseup', handleTooltipMouseUp);
  }

  // Draggable Selection Tooltip State
  let selectionTooltipEl = $state<HTMLDivElement | null>(null);
  let selectionTooltipLeft = $state<number | null>(null);
  let selectionTooltipTop = $state<number | null>(null);
  let isDraggingSelectionTooltip = $state(false);
  let selectionTooltipDragStart = { x: 0, y: 0 };
  let selectionTooltipPositionStart = { left: 0, top: 0 };

  function handleSelectionTooltipMouseDown(e: MouseEvent) {
    if (e.button !== 0) return; // Only left click
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.closest('button') || target.closest('input')) {
      return;
    }
    if (!selectionTooltipEl) return;

    // Get current position relative to its offsetParent
    const rect = selectionTooltipEl.getBoundingClientRect();
    const parent = selectionTooltipEl.parentElement;
    const parentRect = parent ? parent.getBoundingClientRect() : { left: 0, top: 0 };

    const initialLeft = rect.left - parentRect.left;
    const initialTop = rect.top - parentRect.top;

    if (selectionTooltipLeft === null || selectionTooltipTop === null) {
      selectionTooltipLeft = initialLeft;
      selectionTooltipTop = initialTop;
    }

    isDraggingSelectionTooltip = true;
    selectionTooltipDragStart = { x: e.clientX, y: e.clientY };
    selectionTooltipPositionStart = { left: selectionTooltipLeft, top: selectionTooltipTop };

    window.addEventListener('mousemove', handleSelectionTooltipMouseMove);
    window.addEventListener('mouseup', handleSelectionTooltipMouseUp);
  }

  function handleSelectionTooltipMouseMove(e: MouseEvent) {
    if (!isDraggingSelectionTooltip) return;
    const dx = e.clientX - selectionTooltipDragStart.x;
    const dy = e.clientY - selectionTooltipDragStart.y;
    selectionTooltipLeft = selectionTooltipPositionStart.left + dx;
    selectionTooltipTop = selectionTooltipPositionStart.top + dy;
  }

  function handleSelectionTooltipMouseUp() {
    isDraggingSelectionTooltip = false;
    window.removeEventListener('mousemove', handleSelectionTooltipMouseMove);
    window.removeEventListener('mouseup', handleSelectionTooltipMouseUp);
  }

  // Auto-reset selection tooltip position when selection changes
  $effect(() => {
    void selectionStart;
    void selectionEnd;
    selectionTooltipLeft = null;
    selectionTooltipTop = null;
  });

  // Dynamic calculations for selection tooltip positioning and metrics
  const selectionTooltip = $derived.by(() => {
    if (selectionStart === 1 && selectionEnd === 1) return null;
    const len = selectionEnd - selectionStart + 1;
    if (len <= 0) return null;

    if (isProtein) {
      return {
        start: selectionStart,
        end: selectionEnd,
        length: len,
        gc: 0,
        tm: null,
        gravy: gravy(dna.slice(selectionStart - 1, selectionEnd))
      };
    }
    const seg = dnaSeq.slice(selectionStart - 1, selectionEnd);
    const gc = calculatePercentGC(seg);
    let tm = null;
    // the Neb formula melts DNA primers — an RNA selection gets no Tm
    if (!isRna && seg.length >= 4 && seg.length <= 50) {
      try {
        const res = calculateNebTm(seg, { monovalentCationConc: 0.05, primerConc: 0.0000005 });
        tm = typeof res === 'number' ? Math.round(res) : null;
      } catch {}
    }

    return {
      start: selectionStart,
      end: selectionEnd,
      length: len,
      gc,
      tm,
      gravy: null as number | null
    };
  });

  function getFeatureTrackYForRow(row: any): number {
    let y = 8;
    y += 22 + 4; // Ruler

    const rowSites = restrictionSites.filter((s: any) => s.pos >= row.start && s.pos <= row.end);
    if (enzymesOn && rowSites.length) {
      y += getCutsiteLabelHeight(rowSites, row) + 2;
    }

    if (selectionStart !== 1 || selectionEnd !== 1) {
      const selStart = Math.max(selectionStart, row.start);
      const selEnd = Math.min(selectionEnd, row.end);
      if (selStart <= selEnd) y += 18;
    }

    y += singleStrand ? 24 : 52; // Sequence container

    if (transOn) {
      y += 18;
    }
    return y;
  }

  function getFeatureStats(feat: any) {
    const fStart = feat.start;
    const fEnd = feat.end;
    const fLen = fEnd - fStart + 1;
    const seg = dnaSeq.slice(Math.max(0, fStart), Math.min(dnaSeq.length, fEnd + 1));
    const gc = calculatePercentGC(seg);
    const isCds = ['cds', 'gene', 'exon'].includes(feat.type?.toLowerCase());
    const mwKda = isCds ? ((fLen / 3) * 110 / 1000).toFixed(1) : null;
    return { length: fLen, gc, mwKda, isCds };
  }

  const hoveredFeatureStats = $derived.by(() => {
    if (!hoveredFeature) return null;
    const fStart = hoveredFeature.start;
    const fEnd = hoveredFeature.end;
    const fLen = fEnd - fStart + 1;

    // Extract segment sequence to compute GC content on the fly
    const seg = dnaSeq.slice(Math.max(0, fStart), Math.min(dnaSeq.length, fEnd + 1));
    const gc = calculatePercentGC(seg);

    // Calculate molecular weight for protein translations (average AA weight ~110 Da)
    const isCds = ['cds', 'gene', 'exon'].includes(hoveredFeature.type?.toLowerCase());
    const mwKda = isCds ? ((fLen / 3) * 110 / 1000).toFixed(1) : null;

    return {
      length: fLen,
      gc,
      mwKda,
      isCds
    };
  });

  // ---------------- Codon Table State ----------------
  let reverseCodonTable = $state<Record<string, string>>({
    'M': 'ATG', 'W': 'TGG', 'F': 'TTC', 'L': 'CTG', 'I': 'ATC', 'V': 'GTG',
    'S': 'AGC', 'P': 'CCG', 'T': 'ACC', 'A': 'GCG', 'Y': 'TAC', 'H': 'CAC',
    'Q': 'CAG', 'N': 'AAC', 'K': 'AAG', 'D': 'GAC', 'E': 'GAA', 'C': 'TGC',
    'R': 'AGA', 'G': 'GGC', '*': 'TAA'
  });

  // Save custom codon state automatically on changes
  $effect(() => {
    if (typeof localStorage !== 'undefined' && customTaxId) {
      localStorage.setItem('spice_custom_tax_id', customTaxId);
    }
  });

  $effect(() => {
    if (typeof localStorage !== 'undefined' && reverseCodonTable) {
      localStorage.setItem('spice_reverse_codon_table', JSON.stringify(reverseCodonTable));
    }
  });


  function applyDnaToProtein() {
    if (!translatedProtein) {
      pushToast('error', 'No translation', 'Sequence too short');
      return;
    }
    localStorage.setItem('spice.gene.translatedProtein', translatedProtein);
    localStorage.setItem('spice.gene.dnaSeq', dnaSeq);
    pushToast('success', 'Loaded to protein verification', `${translatedProtein.length} aa`);
  }

  async function fetchFromNcbi() {
    if (!quickDbId.trim() || isFetching) return;
    const id = quickDbId.trim().toUpperCase();
    isFetching = true;
    pushLog(`Fetching NCBI sequence [${id}]...`);
    try {
      const resp = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&id=${id}&rettype=gb&retmode=text`);
      const text = await resp.text();
      const lines = text.split('\n');
      let seq = '', inSeq = false, name = '';
      for (const line of lines) {
        if (line.startsWith('LOCUS')) { const parts = line.split(/\s+/); name = parts[1] || id; }
        if (line.startsWith('ORIGIN')) { inSeq = true; continue; }
        if (inSeq && line.startsWith('//')) break;
        if (inSeq) seq += line.replace(/[^a-zA-Z]/g, '').toUpperCase();
      }
      if (seq.length > 0) {
        dnaSeq = seq;
        if (name) plasmidName = name;
        pushLog(`[OK] Fetched NCBI [${id}]: ${seq.length} bp`);
        pushToast('success', `NCBI [${id}] fetched`, `${seq.length} bp`);
      }
    } catch (e: any) {
      pushToast('error', 'NCBI fetch failed', e.message ?? e);
    } finally { isFetching = false; }
  }

  async function fetchCloudCodonTable() {
    if (!customTaxId.trim() || isFetchingCodons) return;
    isFetchingCodons = true;
    pushLog(`Fetching Kazusa codon table for TaxID [${customTaxId}]...`);
    try {
      const res = await backend.fetchKazusaCodonTable(customTaxId.trim());
      reverseCodonTable = res.data;
      pushLog(`[OK] Codon table loaded from cloud`);
      pushToast('success', 'Codon table reloaded', `TaxID: ${customTaxId}`);
    } catch (e: any) {
      pushToast('error', 'Cloud codon fetch failed', e.message ?? e);
    } finally { isFetchingCodons = false; }
  }

  function doCodonOptimize() {
    const prot = translatedProtein.replace(/\*/g, '').replace(/\?/g, '');
    let optDna = '';
    for (const aa of prot) optDna += reverseCodonTable[aa] || 'NNN';
    optDna += 'TAA';
    dnaSeq = optDna;
    pushToast('success', 'Codon optimization complete', 'Optimized with current table');
  }

  // ---------------- Selection Operations ----------------
  function handleCopy() {
    if (selectionStart === 1 && selectionEnd === 1) return;
    const segment = dnaSeq.slice(selectionStart - 1, selectionEnd);
    const startPos = selectionStart;
    const endPos = selectionEnd;

    // Filter features overlapping with selection
    const overlappingFeatures = geneFeatures
      .filter((f: any) => {
        return !(f.end < startPos || f.start > endPos);
      })
      .map((f: any) => {
        const newStart = Math.max(1, f.start - startPos + 1);
        const newEnd = Math.min(segment.length, f.end - startPos + 1);
        return {
          ...f,
          start: newStart,
          end: newEnd
        };
      });

    const clipboardData = {
      source: "SPICE_GENE_EDITOR",
      sequence: segment,
      features: overlappingFeatures
    };

    try {
      const blobText = new Blob([segment], { type: "text/plain" });
      const blobJson = new Blob([JSON.stringify(clipboardData)], { type: "application/json" });
      
      // Prepare offscreen canvas to render selection as an image (PNG) on clipboard (Gap 14)
      const selectedLen = endPos - startPos + 1;
      const blocks: any[] = [];
      const subSeq = dnaSeq.slice(startPos - 1, endPos);
      for (let i = 0; i < selectedLen; i += 10) {
        const bases = [...subSeq.slice(i, i + 10)];
        blocks.push({
          blockIdx: Math.floor(i / 10),
          bases,
          startPos: startPos + i
        });
      }

      const mockRow = {
        rowIdx: 0,
        start: startPos,
        end: endPos,
        blocks
      };

      const dpr = window.devicePixelRatio || 1;
      const multStr = (typeof localStorage !== 'undefined' && localStorage.getItem('spice_gel_export_multiplier')) || '4';
      const multiplier = parseInt(multStr) || 4;
      const selectCanvasWidth = LEFT_MARGIN + selectedLen * CHAR_W + RIGHT_MARGIN;
      const rowHeight = 120; // safe bounding box for drawing

      const cv = document.createElement('canvas');
      cv.width = selectCanvasWidth * multiplier * dpr;
      cv.height = rowHeight * multiplier * dpr;
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(dpr * multiplier, 0, 0, dpr * multiplier, 0, 0);

      // Fill background (matches dark theme of sequence view)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, selectCanvasWidth, rowHeight);

      // Draw row content onto canvas
      drawSequenceRowOnCanvas(ctx, {
        row: mockRow,
        dna: dnaSeq,
        showEnzymes: enzymesOn,
        showFeatures,
        showTranslations: transOn,
        restrictionSites,
        geneFeatures,
        parts,
        primers,
        selectionStart,
        selectionEnd,
        containerWidth: selectCanvasWidth,
        hoveredFeatureId: null,
        dpr,
        showSingleStrand: singleStrand,
        colorTheme
      });

      cv.toBlob((blob) => {
        try {
          const clipboardItems: Record<string, Blob> = {
            "text/plain": blobText,
            "application/json": blobJson
          };
          if (blob) {
            clipboardItems["image/png"] = blob;
          }
          
          navigator.clipboard.write([
            new ClipboardItem(clipboardItems)
          ]).then(() => {
            pushToast('success', 'Copied sequence + features + image!', `${segment.length} bp with ${overlappingFeatures.length} features`);
          }).catch(() => {
            navigator.clipboard.writeText(segment);
            pushToast('success', 'Copied to clipboard (text fallback)', `${segment.length} bp`);
          });
        } catch (err) {
          navigator.clipboard.writeText(segment);
          pushToast('success', 'Copied to clipboard', `${segment.length} bp`);
        }
      }, "image/png");
    } catch (e) {
      navigator.clipboard.writeText(segment);
      pushToast('success', 'Copied to clipboard', `${segment.length} bp`);
    }
  }

  function handleCopyAsImage() {
    if (selectionStart === 1 && selectionEnd === 1) return;
    const startPos = selectionStart;
    const endPos = selectionEnd;

    try {
      const selectedLen = endPos - startPos + 1;
      const blocks: any[] = [];
      const subSeq = dnaSeq.slice(startPos - 1, endPos);
      for (let i = 0; i < selectedLen; i += 10) {
        const bases = [...subSeq.slice(i, i + 10)];
        blocks.push({
          blockIdx: Math.floor(i / 10),
          bases,
          startPos: startPos + i
        });
      }

      const mockRow = {
        rowIdx: 0,
        start: startPos,
        end: endPos,
        blocks
      };

      const dpr = window.devicePixelRatio || 1;
      const multStr = (typeof localStorage !== 'undefined' && localStorage.getItem('spice_gel_export_multiplier')) || '4';
      const multiplier = parseInt(multStr) || 4;
      const selectCanvasWidth = LEFT_MARGIN + selectedLen * CHAR_W + RIGHT_MARGIN;
      const rowHeight = 120;

      const cv = document.createElement('canvas');
      cv.width = selectCanvasWidth * multiplier * dpr;
      cv.height = rowHeight * multiplier * dpr;
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(dpr * multiplier, 0, 0, dpr * multiplier, 0, 0);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, selectCanvasWidth, rowHeight);

      drawSequenceRowOnCanvas(ctx, {
        row: mockRow,
        dna: dnaSeq,
        showEnzymes: enzymesOn,
        showFeatures,
        showTranslations: transOn,
        restrictionSites,
        geneFeatures,
        parts,
        primers,
        selectionStart,
        selectionEnd,
        containerWidth: selectCanvasWidth,
        hoveredFeatureId: null,
        dpr,
        showSingleStrand: singleStrand,
        colorTheme
      });

      cv.toBlob((blob) => {
        try {
          if (blob) {
            navigator.clipboard.write([
              new ClipboardItem({
                "image/png": blob
              })
            ]).then(() => {
              pushToast('success', 'Copied as image', m.dvCopiedImageToast());
            }).catch((err) => {
              pushToast('error', 'Copy Image failed', err.message);
            });
          }
        } catch (err: any) {
          pushToast('error', 'Copy Image failed', err.message);
        }
      }, "image/png");
    } catch (e: any) {
      pushToast('error', 'Generate Image failed', e.message);
    }
  }


  function handleKeyDown(e: KeyboardEvent) {
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.classList.contains("s-texteditor-content") || active.hasAttribute("contenteditable"))) {
      return;
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isModKey = isMac ? e.metaKey : e.ctrlKey;

    if (isModKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      handleCopy();
      return;
    }

    // Support Arrow keys for navigation and selection
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const maxPos = dna.length;
      const bpr = basesPerRow;

      if (e.shiftKey) {
        // Shift + Arrow keys: Extend selection
        if (e.key === 'ArrowLeft') {
          if (selectionStart > 1) {
            selectionStart -= 1;
          }
        } else if (e.key === 'ArrowRight') {
          if (selectionEnd < maxPos) {
            selectionEnd += 1;
          }
        } else if (e.key === 'ArrowUp') {
          if (selectionStart > bpr) {
            selectionStart -= bpr;
          } else {
            selectionStart = 1;
          }
        } else if (e.key === 'ArrowDown') {
          if (selectionEnd + bpr <= maxPos) {
            selectionEnd += bpr;
          } else {
            selectionEnd = maxPos;
          }
        }
      } else {
        // Normal Arrow keys: Move cursor / Collapse selection
        if (selectionStart !== selectionEnd) {
          // Collapse selection
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            selectionEnd = selectionStart;
          } else {
            selectionStart = selectionEnd;
          }
        } else {
          // Move single cursor
          if (e.key === 'ArrowLeft') {
            if (selectionStart > 1) {
              selectionStart -= 1;
              selectionEnd = selectionStart;
            }
          } else if (e.key === 'ArrowRight') {
            if (selectionStart < maxPos) {
              selectionStart += 1;
              selectionEnd = selectionStart;
            }
          } else if (e.key === 'ArrowUp') {
            if (selectionStart > bpr) {
              selectionStart -= bpr;
              selectionEnd = selectionStart;
            } else {
              selectionStart = 1;
              selectionEnd = 1;
            }
          } else if (e.key === 'ArrowDown') {
            if (selectionStart + bpr <= maxPos) {
              selectionStart += bpr;
              selectionEnd = selectionStart;
            } else {
              selectionStart = maxPos;
              selectionEnd = maxPos;
            }
          }
        }
      }
      return;
    }

    // SPD's viewers are read-only projections of stored records: base
    // editing, paste-insertion and annotation tools were dropped on purpose.
  }

  // ---------------- Mouse Drag Selection ----------------
  let isDraggingSelect = $state(false);
  let selectDragAnchor = $state<number | null>(null);

  function handleMouseDown(pos: number, e?: MouseEvent, clickedRow?: any, localY?: number) {
    if (containerEl) {
      containerEl.focus();
    }
    isDraggingSelect = true;
    selectDragAnchor = pos;
    selectionStart = pos;
    selectionEnd = pos;

    // Cache the previous clicked feature to support toggle on second click
    const prevClickedId = clickedFeature ? clickedFeature.id : null;
    clickedFeature = null;

    if (clickedRow && localY !== undefined) {
      const row = clickedRow;
      const y = localY;
      
      const featBaseY = getFeatureTrackYForRow(row);
      const rowFeats = geneFeatures.filter((f: any) => !(f.end < row.start || f.start > row.end));
      const offsets = calculateRowYOffsets(rowFeats);
      
      const clicked = rowFeats.find((feat: any) => {
        if (pos >= feat.start && pos <= feat.end) {
          const itemOffset = offsets.find((o: any) => o.annotation.id === feat.id);
          if (itemOffset) {
            const trackYStart = featBaseY + itemOffset.yOffset * 18;
            const trackYEnd = trackYStart + 14;
            return y >= trackYStart && y <= trackYEnd;
          }
        }
        return false;
      });
      
      if (clicked) {
        if (prevClickedId === clicked.id) {
          // Toggle closed if clicking the same feature again!
          clickedFeature = null;
        } else {
          clickedFeature = clicked;
          
          // Center-align horizontally
          const midBp = (clicked.start + clicked.end) / 2;
          const xOffset = LEFT_MARGIN + (midBp - row.start) * CHAR_W;
          tooltipLeft = xOffset - 120;
          
          const itemOffset = offsets.find((o: any) => o.annotation.id === clicked.id);
          const yOffset = itemOffset ? itemOffset.yOffset : 0;
          const trackYEnd = featBaseY + yOffset * 18 + 14;
          
          const layout = rowLayouts.layouts.find(l => l.row.rowIdx === row.rowIdx);
          const rowTop = layout ? layout.top : 0;
          tooltipTop = rowTop + trackYEnd + 4;
        }

        isDraggingSelect = false;
        selectDragAnchor = null;
      }
    }
  }

  function handleMouseMove(pos: number) {
    if (isDraggingSelect && selectDragAnchor !== null) {
      if (pos < selectDragAnchor) {
        selectionStart = pos;
        selectionEnd = selectDragAnchor;
      } else {
        selectionStart = selectDragAnchor;
        selectionEnd = pos;
      }
    }
  }

  function handleMouseUp() {
    isDraggingSelect = false;
    selectDragAnchor = null;
  }

 function handleScroll(e: Event) {
   if (!containerEl) return;
   scrollTop = containerEl.scrollTop;
    totalContentH = containerEl.scrollHeight;
    viewportH = containerEl.clientHeight;
 }
</script>

<div class="dna-viewer" style="display: flex; flex-direction: column; height: 100%; gap: 0; font-family: var(--pix-font); position: relative;">
  
  <!-- Minimap -->
  <SequenceMinimap 
    {dna} 
    {geneFeatures} 
    {selectionStart} 
    {selectionEnd} 
   {scrollTop} 
   {totalContentH} 
    canvasH={viewportH} 
   onMinimapClick={(pct) => {
      if (containerEl) containerEl.scrollTop = (containerEl.scrollHeight - containerEl.clientHeight) * pct;
   }} 
  />

  <!-- Selection info bar (SnapGene style) -->
  <SelectionToolkit
    {selectionStart}
    {selectionEnd}
    {selectedGcContent}
    {selectedTm}
    proteinMode={isProtein}
    rnaMode={isRna}
    {selectedGravy}
    onCopy={handleCopy}
    onCopyAsImage={handleCopyAsImage}
    onCancel={() => { selectionStart = 1; selectionEnd = 1; }}
  />

  <!-- Master Split: Vertical Toolbar + Sequence Canvas -->
  <div style="display: flex; gap: 0; flex: 1; min-height: 0; position: relative;">

    <!-- Vertical Toolbar -->
    <SequenceToolbar
      bind:showEnzymes
      bind:showFeatures
      bind:showTranslations
      proteinMode={isProtein || isRna}
    />

   <!-- Sequence Canvas -->
   <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
   <div 
     bind:this={containerEl}
     class="dna-sequence-view" 
     role="application"
     tabindex="0"
     style="flex: 1; display: flex; flex-direction: column; gap: 0; overflow-y: auto; background: transparent; position: relative; user-select: none; outline: none;"
     onscroll={handleScroll}
     onkeydown={handleKeyDown}
     onmousemove={handleMouseMoveContainer}
   >
     <!-- Virtual scroll height placeholder -->
     <div style="height: {rowLayouts.totalHeight}px; width: 100%; position: absolute; top: 0; left: 0; pointer-events: none;"></div>

     <!-- Absolute position virtualized rows -->
     {#each visibleRowLayouts as layout (layout.row.rowIdx)}
       <div style="position: absolute; top: 0; left: 0; width: 100%; transform: translateY({layout.top}px); height: {layout.height}px;">
         <SequenceRow
           row={layout.row}
           {dna}
           showEnzymes={enzymesOn}
           {showFeatures}
           showTranslations={transOn}
           {restrictionSites}
           {geneFeatures}
           {parts}
           {primers}
           bind:selectionStart
           bind:selectionEnd
           containerWidth={containerWidth}
           bind:hoveredFeature
           onMouseDown={handleMouseDown}
           onMouseMove={handleMouseMove}
           onMouseUp={handleMouseUp}
           showSingleStrand={singleStrand}
           {colorTheme}
           {modifiedRanges}
         />
       </div>
     {/each}
    </div>
  </div>

  <!-- Bottom Status Bar (SnapGene style) -->
  <div style="display: flex; justify-content: space-between; align-items: center; padding: 3px 10px; background: var(--pix-bg-2); border-top: 1px solid var(--pix-border); font-size: 11px; font-family: 'SF Mono', 'Monaco', monospace;">
    <div style="color: var(--pix-fg);">
      {#if isProtein}
        {#if selectionStart !== 1 || selectionEnd !== 1}
          {t('选中', 'Selected')}: <span style="font-weight: 600;">{selectionStart}..{selectionEnd}</span> = <span style="font-weight: 600;">{selectionEnd - selectionStart + 1} {t('残基', 'res')}</span>{#if selectedGravy !== null} [{t('疏水性', 'GRAVY')} {selectedGravy.toFixed(2)} ({t('查看器估算', 'viewer')})]{/if}
        {:else}
          <span style="color: var(--pix-fg-dim);">{m.dnaViewerDragSelect()}</span> &middot; {m.dnaViewerLengthLabel()} {dna.length} {t('残基', 'res')} &middot; {t('质量', 'Mass')}: {assertedMass != null ? `${assertedMass.toFixed(1)} Da (${t('来源标注', 'source')})` : t('来源未提供', 'not asserted by source')}{#if assertedCrc64} &middot; CRC64 {assertedCrc64}{/if}
        {/if}
      {:else if selectionStart !== 1 || selectionEnd !== 1}
        Selected: <span style="font-weight: 600;">{selectionStart}..{selectionEnd}</span> = <span style="font-weight: 600;">{selectionEnd - selectionStart + 1} {unitLabel}</span> [{selectedGcContent.toFixed(1)}% GC]{#if selectedTm !== null} | Tm = {selectedTm}&deg;C{/if}
      {:else}
        <span style="color: var(--pix-fg-dim);">{m.dnaViewerDragSelect()}</span> &middot; {m.dnaViewerLengthLabel()} {dna.length} {unitLabel} &middot; GC: {dnaGcContent.toFixed(1)}%
      {/if}
    </div>
    <div style="color: var(--pix-fg-dim);">
      {#if isProtein}
        {geneFeatures.length} {t('特征', 'features')}
      {:else if isRna}
        {geneFeatures.length} {t('特征', 'features')}
      {:else}
        {restrictionSites.length} enzymes | {geneFeatures.length} features
      {/if}
    </div>
  </div>
</div>

<!-- Clicked Feature Tooltip (SnapGene-style locked below clicked feature!) -->
{#if clickedFeature}
  {@const stats = getFeatureStats(clickedFeature)}
  <div style="position: absolute; left: {tooltipLeft}px; top: {tooltipTop}px; width: 240px; background: var(--pix-panel); border: 1.5px solid {clickedFeature.color || 'var(--pix-cyan)'}; border-radius: 0; box-shadow: 0 4px 12px rgba(15,23,42,0.18); padding: 8px 10px; z-index: 1000; font-size: 10px; font-family: var(--pix-font);">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div 
      onmousedown={handleTooltipMouseDown}
      style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; border-bottom: 1px solid rgba(15,23,42,0.1); padding-bottom: 3px; cursor: move; user-select: none;"
    >
      <span style="font-weight: 600; color: {clickedFeature.color || 'var(--pix-cyan)'}; font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px;">{clickedFeature.name} ✥</span>
      <Button size="xs" variant="ghost" class="h-5 px-1 text-[10px] text-[var(--pix-red)]" onclick={() => (clickedFeature = null)}>[X]</Button>
    </div>
    
    <div style="display: flex; flex-direction: column; gap: 3px; color: var(--pix-fg-dim);">
      <div style="display: flex; justify-content: space-between;">
        <span>{m.labelRange()}:</span>
        <span class="pix-num" style="color: var(--pix-fg);">{clickedFeature.start}..{clickedFeature.end} {unitLabel}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>{m.labelSize()}:</span>
        <span class="pix-num" style="color: var(--pix-fg);">{stats.length} {unitLabel}</span>
      </div>
      {#if isProtein}
        {#if clickedFeature.description}
          <div style="color: var(--pix-fg); white-space: normal;">{clickedFeature.description}</div>
        {/if}
        {#if clickedFeature.residue}
          <div style="display: flex; justify-content: space-between;">
            <span>{t('残基类型', 'Residue')}:</span>
            <span class="pix-num" style="color: var(--pix-fg);">{clickedFeature.residue}</span>
          </div>
        {/if}
      {:else}
        <div style="display: flex; justify-content: space-between;">
          <span>{m.labelGcContent()}:</span>
          <span class="pix-num" style="color: var(--pix-cyan);">{stats.gc.toFixed(1)}%</span>
        </div>
        {#if stats.isCds && stats.mwKda}
          <div style="display: flex; justify-content: space-between; border-top: 1px dashed rgba(15,23,42,0.1); padding-top: 2px; margin-top: 2px;">
            <span>{m.labelMw()}:</span>
            <span class="pix-num" style="color: var(--pix-accent-2);">{stats.mwKda} kDa</span>
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<!-- Selection Tooltip (fixed at the bottom center of the editor, floating over the workspace!) -->
{#if selectionTooltip}
  <div 
    bind:this={selectionTooltipEl}
    style={selectionTooltipLeft !== null && selectionTooltipTop !== null 
      ? `position: absolute; left: ${selectionTooltipLeft}px; top: ${selectionTooltipTop}px; width: 280px; background: var(--pix-panel); border: 1.5px solid var(--pix-accent-2); border-radius: 0; box-shadow: 0 4px 20px rgba(15,23,42,0.18); padding: 8px 12px; z-index: 1000; font-size: 10px; font-family: var(--pix-font); text-align: left;`
      : `position: absolute; bottom: 42px; left: 50%; transform: translateX(-50%); width: 280px; background: var(--pix-panel); border: 1.5px solid var(--pix-accent-2); border-radius: 0; box-shadow: 0 4px 20px rgba(15,23,42,0.18); padding: 8px 12px; z-index: 1000; font-size: 10px; font-family: var(--pix-font); text-align: left;`}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div 
      onmousedown={handleSelectionTooltipMouseDown}
      style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; border-bottom: 1px solid rgba(15,23,42,0.12); padding-bottom: 3px; cursor: move; user-select: none;"
    >
      <span style="font-weight: bold; color: var(--pix-accent-2); font-size: 10.5px;">{m.labelSelectionProperties()} ✥</span>
      <Button size="xs" variant="ghost" class="h-5 px-1 text-[10px] text-[var(--pix-red)]" onclick={() => { selectionStart = 1; selectionEnd = 1; }}>[X]</Button>
    </div>
    
    <div style="display: flex; flex-direction: column; gap: 3px; color: var(--pix-fg-dim); margin-bottom: 6px;">
      <div style="display: flex; justify-content: space-between;">
        <span>{m.labelRange()}:</span>
        <span class="pix-num" style="color: var(--pix-fg);">{selectionTooltip.start}..{selectionTooltip.end} {unitLabel}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span>{m.labelSelectionSize()}:</span>
        <span class="pix-num" style="color: var(--pix-fg);">{selectionTooltip.length} {unitLabel}</span>
      </div>
      {#if isProtein}
        {#if selectionTooltip.gravy !== null}
          <div style="display: flex; justify-content: space-between;">
            <span>{t('疏水性', 'GRAVY')}:</span>
            <span class="pix-num" style="color: var(--pix-cyan);">{selectionTooltip.gravy.toFixed(2)} ({t('查看器估算', 'viewer')})</span>
          </div>
        {/if}
      {:else}
        <div style="display: flex; justify-content: space-between;">
          <span>{m.labelGcContent()}:</span>
          <span class="pix-num" style="color: var(--pix-cyan);">{selectionTooltip.gc.toFixed(1)}%</span>
        </div>
        {#if selectionTooltip.tm !== null}
          <div style="display: flex; justify-content: space-between;">
            <span>{m.labelAnnealingTemp()} (Tm):</span>
            <span class="pix-num" style="color: var(--pix-green);">{selectionTooltip.tm} °C</span>
          </div>
        {/if}
      {/if}
    </div>

    <!-- Quick Actions inside selection tooltip -->
    <div style="display: flex; gap: 4px; border-top: 1px dashed rgba(15,23,42,0.1); padding-top: 6px; margin-top: 4px;">
      <Button size="xs" class="flex-1 text-[10px]" onclick={handleCopy}>
        {m.labelCopy()}
      </Button>
    </div>
  </div>
{/if}

<style>
  .dna-sequence-view::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  .dna-sequence-view::-webkit-scrollbar-track {
    background: transparent;
  }
  .dna-sequence-view::-webkit-scrollbar-thumb {
    background: var(--pix-border-hi);
    border-radius: 0;
  }
  .dna-sequence-view::-webkit-scrollbar-thumb:hover {
    background: var(--pix-fg-dim);
  }
</style>
