<script lang="ts">
	// Candidate PDB chains share a UniProt accession with this sequence but not
	// its exact letters (initiator Met, signal peptide, isoform). Nothing here
	// is an exact match: a human confirms or rejects each row and the decision
	// is persisted. The section stays visible beside exact structures so the
	// distinction is never hidden.
	import { sequences } from '$lib/api/client';
	import type {
		SequenceStructureCandidate,
		StructureCandidateDecisionReceipt,
		StructureCandidateDecision,
		SequenceStructureCandidatesData
	} from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr, enumLabel } from '$lib/i18n';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import Input from '$lib/components/Input.svelte';

	let {
		sequenceId,
		data = $bindable(null),
		loading = false
	}: {
		sequenceId: string;
		data?: SequenceStructureCandidatesData | null;
		loading?: boolean;
	} = $props();

	const DECISION_TONE: Record<StructureCandidateDecision, string> = {
		pending: 'muted',
		confirmed: 'ok',
		rejected: 'bad'
	};

	let decideOpen = $state(false);
	let pendingCandidate = $state<SequenceStructureCandidate | null>(null);
	let pendingDecision = $state<'confirmed' | 'rejected'>('confirmed');
	let note = $state('');
	let busy = $state(false);

	function rowKey(c: SequenceStructureCandidate): string {
		return `${c.pdbId}:${c.entityId}`;
	}

	function fmtResolution(v?: number | null): string {
		return v == null ? '—' : `${Number(v).toFixed(2)} Å`;
	}

	/** Coverage arrives as a fraction from the backend; accept a percentage too. */
	function fmtCoverage(v?: number | null): string {
		if (v == null) return '—';
		const pct = v <= 1 ? v * 100 : v;
		return `${pct.toFixed(1)} %`;
	}

	function entryHref(c: SequenceStructureCandidate): string {
		return `/pdb-entries/${c.pdbEntryId || c.pdbId}`;
	}

	function openDecision(c: SequenceStructureCandidate, decision: 'confirmed' | 'rejected') {
		pendingCandidate = c;
		pendingDecision = decision;
		note = '';
		decideOpen = true;
	}

	function replaceDecision(
		c: SequenceStructureCandidate,
		decision: StructureCandidateDecision,
		noteText: string | null
	) {
		if (!data) return;
		const candidates = data.candidates.map((row) =>
			row.pdbId === c.pdbId && row.entityId === c.entityId
				? {
						...row,
						decision,
						note: noteText,
						decidedAt: decision === 'pending' ? null : Math.floor(Date.now() / 1000)
					}
				: row
		);
		data = { ...data, candidates };
	}

	function applyReceipt(
		receipt: StructureCandidateDecisionReceipt,
		c: SequenceStructureCandidate,
		noteOverride?: string | null
	) {
		// The receipt carries the authoritative decision even when the server
		// treats the write as a no-op; mirror it locally either way.
		const decision: StructureCandidateDecision = receipt.decision ?? 'pending';
		const nextNote =
			decision === 'pending' ? null : noteOverride !== undefined ? noteOverride : (c.note ?? null);
		replaceDecision(c, decision, nextNote);
	}

	async function submitDecision() {
		const c = pendingCandidate;
		if (!c) return;
		busy = true;
		try {
			const trimmed = note.trim();
			const receipt = await sequences.decideStructureCandidate(
				sequenceId,
				c.pdbId,
				c.entityId,
				trimmed ? { decision: pendingDecision, note: trimmed } : { decision: pendingDecision }
			);
			applyReceipt(receipt, c, trimmed || null);
			if (receipt.updated) {
				toastOk(
					tr(
						pendingDecision === 'confirmed'
							? 'protein_candidate_confirmed'
							: 'protein_candidate_rejected'
					)
				);
			}
			decideOpen = false;
			pendingCandidate = null;
			note = '';
		} catch (e) {
			toastErr(e);
		} finally {
			busy = false;
		}
	}

	async function revoke(c: SequenceStructureCandidate) {
		busy = true;
		try {
			const receipt = await sequences.clearStructureCandidate(sequenceId, c.pdbId, c.entityId);
			applyReceipt(receipt, c);
			if (receipt.updated) toastOk(tr('protein_candidate_cleared'));
		} catch (e) {
			toastErr(e);
		} finally {
			busy = false;
		}
	}
</script>

{#if data && data.candidates.length > 0}
	<Section title={tr('protein_structure_candidates')}>
		{#snippet actions()}
			{#if loading}
				<span class="text-xs text-muted-foreground">{tr('common_loading')}</span>
			{/if}
		{/snippet}
		<p class="text-xs text-muted-foreground">{tr('protein_structure_candidates_hint')}</p>
		<ul class="mt-2 divide-y">
			{#each data.candidates as c (rowKey(c))}
				<li class="py-2.5">
					<div class="flex flex-wrap items-start justify-between gap-2">
						<div class="min-w-0 flex-1 space-y-1">
							<div class="flex flex-wrap items-center gap-2">
								<a class="font-mono text-base underline" href={entryHref(c)}>{c.pdbId}</a>
								<Badge tone={DECISION_TONE[c.decision] ?? 'muted'}>
									{enumLabel('decision', c.decision)}
								</Badge>
								{#if c.relation}<Badge tone="muted">{c.relation}</Badge>{/if}
								{#if c.hasCoordinates}
									<Badge tone="info">{tr('protein_candidate_has_coordinates')}</Badge>
								{/if}
							</div>
							{#if c.title}<p class="text-sm">{c.title}</p>{/if}
							<div
								class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
							>
								{#if c.experimentalMethod}<span>{c.experimentalMethod}</span>{/if}
								{#if c.resolutionAngstrom != null}
									<span>{fmtResolution(c.resolutionAngstrom)}</span>
								{/if}
								{#if c.coverage != null}
									<span>{tr('protein_candidate_coverage')} {fmtCoverage(c.coverage)}</span>
								{/if}
								{#if c.identity != null}
									<span>{tr('protein_candidate_identity')} {fmtCoverage(c.identity)}</span>
								{/if}
								{#if c.chainNames.length}
									<span>{tr('protein_candidate_chains')} {c.chainNames.join(', ')}</span>
								{/if}
								{#if c.uniprotAccessions.length}
									<span>
										{tr('protein_candidate_uniprot')}
										<span class="font-mono">{c.uniprotAccessions.join(', ')}</span>
									</span>
								{/if}
							</div>
							{#if c.note}
								<p class="text-xs text-muted-foreground">
									{tr('protein_candidate_note')}: {c.note}
								</p>
							{/if}
						</div>
						<div class="flex flex-wrap items-center gap-1">
							{#if c.hasCoordinates}
								<Button size="xs" variant="ghost" href={entryHref(c)}>
									{tr('protein_candidate_view_structure')}
								</Button>
							{/if}
							{#if session.signedIn}
								{#if c.decision === 'pending'}
									<Button
										size="xs"
										variant="outline"
										disabled={busy}
										onclick={() => openDecision(c, 'confirmed')}
									>
										{tr('protein_candidate_confirm')}
									</Button>
									<Button
										size="xs"
										variant="ghost"
										disabled={busy}
										onclick={() => openDecision(c, 'rejected')}
									>
										{tr('protein_candidate_reject')}
									</Button>
								{:else}
									<Button size="xs" variant="ghost" disabled={busy} onclick={() => revoke(c)}>
										{tr('protein_candidate_revoke')}
									</Button>
								{/if}
							{/if}
						</div>
					</div>
				</li>
			{/each}
		</ul>
	</Section>
{/if}

<Dialog
	bind:open={decideOpen}
	title={pendingDecision === 'confirmed'
		? tr('protein_candidate_confirm_title')
		: tr('protein_candidate_reject_title')}
>
	<div class="space-y-3">
		{#if pendingCandidate}
			<p class="text-sm">
				<span class="font-mono">{pendingCandidate.pdbId}</span>
				{#if pendingCandidate.title}
					<span class="text-muted-foreground"> · {pendingCandidate.title}</span>
				{/if}
			</p>
		{/if}
		<label class="block space-y-1">
			<span class="text-xs font-medium text-muted-foreground">
				{tr('protein_candidate_note_label')}
			</span>
			<Input
				name="candidate-note"
				bind:value={note}
				placeholder={tr('protein_candidate_note_placeholder')}
			/>
		</label>
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (decideOpen = false)} disabled={busy}>
				{tr('common_cancel')}
			</Button>
			<Button onclick={submitDecision} disabled={busy}>
				{pendingDecision === 'confirmed'
					? tr('protein_candidate_confirm')
					: tr('protein_candidate_reject')}
			</Button>
		</div>
	</div>
</Dialog>
