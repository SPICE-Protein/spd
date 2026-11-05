<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { enzymeReactions, external, reagents, search } from '$lib/api/client';
	import type { ReactionRow } from '$lib/api/types';
	import { tr } from '$lib/i18n';
	import { toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import EntityBreadcrumb from '$lib/components/EntityBreadcrumb.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import WikiPanel from '$lib/components/WikiPanel.svelte';
	import ReferencesPanel from '$lib/components/ReferencesPanel.svelte';
	import RelationsPanel from '$lib/components/RelationsPanel.svelte';
	import MoleculeViewer from '$lib/components/MoleculeViewer.svelte';

	const id = $derived(page.params.id ?? '');

	let row = $state<ReactionRow | null>(null);
	let error = $state('');
	let loading = $state(true);
	let importingEnzyme = $state('');

	async function load() {
		loading = true;
		try {
			row = (await enzymeReactions.get(id)) ?? null;
			error = '';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			row = null;
		} finally {
			loading = false;
		}
	}
	$effect(() => {
		if (id) void load();
	});

	/**
	 * An annotated enzyme is a UniProt record addressed by accession upstream,
	 * but the reader sees an SPD record: the import door materialises it and
	 * answers with the local public id route. The accession stays in storage,
	 * never in the table.
	 */
	async function openEnzyme(accession: string | undefined) {
		if (!accession || importingEnzyme) return;
		importingEnzyme = accession;
		try {
			const result = await external.import('uniprot', accession);
			await goto(result.route);
		} catch (e) {
			toastErr(e);
		} finally {
			importingEnzyme = '';
		}
	}

	function asList<T>(value: T[] | null | undefined): T[] {
		return Array.isArray(value) ? value : [];
	}

	const participants = $derived(
		asList(row?.participants).filter((p) => p && (p.name || p.chebiId))
	);

	type Participant = NonNullable<ReactionRow['participants']>[number];
	type ParticipantState = { loading: boolean; reagentId: string | null; smiles: string | null };

	let participantState = $state<Record<string, ParticipantState>>({});
	let importingParticipant = $state('');
	let importingRelated = $state('');
	let participantGeneration = 0;

	type RelatedState = { loading: boolean; reactionId: string | null };
	let relatedState = $state<Record<string, RelatedState>>({});
	let relatedGeneration = 0;

	function relatedKey(r: { id?: string; relation?: string }, index: number): string {
		return `${r.id ?? r.relation ?? 'related'}-${index}`;
	}
	function rheaNumeric(value: string | null | undefined): string {
		const numeric = (value ?? '').replace(/^RHEA:/i, '').trim();
		return /^\d+$/.test(numeric) ? numeric : '';
	}

	function participantKey(p: Participant, index: number): string {
		return `${p.chebiId ?? p.name ?? 'participant'}-${index}`;
	}
	function participantChebi(p: Participant): string {
		const numeric = chebiNumeric(p.chebiId);
		return numeric ? `CHEBI:${numeric}` : '';
	}
	function reagentHref(reagentId: string): string {
		return `/reagents/${reagentId}`;
	}
	function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
		return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
	}

	type LocalReagent = { id: string; smiles: string | null };

	/** Search matches identifiers *and* synonyms, so a ChEBI query can surface
	 *  a compound that merely lists a related class in its synonyms. Verify the
	 *  stored identifier before offering the link. */
	async function localReagent(reagentId: string, chebi = ''): Promise<LocalReagent | null> {
		try {
			const reagent = await reagents.get(reagentId);
			if (chebi) {
				const wanted = chebi.trim().toLowerCase();
				const carries = (reagent.identifiers ?? []).some(
					(identifier) => String(identifier.value ?? '').trim().toLowerCase() === wanted
				);
				if (!carries) return null;
			}
			const smiles =
				String(reagent.isomericSmiles ?? '').trim() || String(reagent.smiles ?? '').trim();
			return { id: reagentId, smiles: smiles || null };
		} catch {
			return null;
		}
	}

	/** PubChem CID → SPD reagent id. The search index does not cover
	 *  `pubchem_cid`, so build the crosswalk once from the catalog list. */
	let reagentIndexPromise: Promise<Map<string, string>> | null = null;
	async function reagentIdByPubchemCid(cid: string): Promise<string | null> {
		if (!reagentIndexPromise) {
			reagentIndexPromise = (async () => {
				const index = new Map<string, string>();
				try {
					const catalog = (await reagents.list()) as { items?: unknown[] } | null;
					const items = Array.isArray(catalog?.items) ? catalog.items : [];
					for (const row of items) {
						const item = row as Record<string, unknown>;
						const itemCid = item.pubchemCid;
						const id = String(item.id ?? '');
						if (itemCid == null || !id) continue;
						index.set(String(itemCid), id);
					}
				} catch {
					// Leave the index empty; identifier and name matching still run.
				}
				return index;
			})();
		}
		const index = await reagentIndexPromise;
		return index.get(cid) ?? null;
	}

	/** A generic Rhea compound (e.g. "a monocarboxylate") has no ChEBI→SPD
	 *  identifier overlap, but PubChem's xref still names the representative
	 *  structure SPD would import for it. Use that CID as a second identity. */
	async function findReagentByPubchemCid(cid: string): Promise<LocalReagent | null> {
		const id = await reagentIdByPubchemCid(cid);
		return id ? await localReagent(id) : null;
	}

	/** Resolve a Rhea participant to the local reagent that already carries
	 *  the same ChEBI id (or, failing that, the same PubChem record or the same
	 *  exact name). The local structure is also returned: upstream omits
	 *  generic compounds' SMILES, and SPD may already hold a drawable record. */
	async function findLocalReagent(p: Participant): Promise<LocalReagent | null> {
		const chebi = participantChebi(p);
		if (chebi) {
			const { data } = await search.run({ q: chebi, entityType: 'reagent', limit: 10 });
			const hits = (Array.isArray(data) ? data : []).filter(
				(row) => row.entityType === 'reagent' && row.id
			);
			for (const hit of hits.slice(0, 5)) {
				const match = await localReagent(String(hit.id), chebi);
				if (match) return match;
			}
			const cid = await pubchemCidForChebi(chebi);
			if (cid) {
				const match = await findReagentByPubchemCid(cid);
				if (match) return match;
			}
		}
		const name = (p.name ?? '').trim();
		if (!name) return null;
		const { data } = await search.run({ q: name, entityType: 'reagent', limit: 10 });
		const hits = Array.isArray(data) ? data : [];
		const hit = hits.find(
			(row) => row.entityType === 'reagent' && sameName(String(row.name ?? ''), name)
		);
		return hit?.id ? await localReagent(String(hit.id)) : null;
	}

	/** A related reaction is addressed upstream by its Rhea id; the entry the
	 *  reader is offered is the local SPD record, not the external accession. */
	async function findLocalReaction(rheaId: string): Promise<string | null> {
		const numeric = rheaNumeric(rheaId);
		if (!numeric) return null;
		const { data } = await search.run({ q: numeric, entityType: 'reaction', limit: 20 });
		const hits = Array.isArray(data) ? data : [];
		const hit = hits.find((row) => {
			const hitRhea = rheaNumeric(String((row as Record<string, unknown>).rheaId ?? ''));
			return hitRhea === numeric;
		});
		return hit?.id ? String(hit.id) : null;
	}

	async function resolveRelatedReactions(items: Array<{ id?: string }>) {
		const run = ++relatedGeneration;
		const next: Record<string, RelatedState> = {};
		items.forEach((r, index) => {
			next[relatedKey(r, index)] = { loading: true, reactionId: null };
		});
		relatedState = next;
		await Promise.all(
			items.map(async (r, index) => {
				const key = relatedKey(r, index);
				const rheaId = String(r.id ?? '');
				if (!rheaId) {
					if (run === relatedGeneration) relatedState[key] = { loading: false, reactionId: null };
					return;
				}
				try {
					const reactionId = await findLocalReaction(rheaId);
					if (run === relatedGeneration) relatedState[key] = { loading: false, reactionId };
				} catch {
					if (run === relatedGeneration) relatedState[key] = { loading: false, reactionId: null };
				}
			})
		);
	}

	async function resolveParticipantReagents(items: Participant[]) {
		const run = ++participantGeneration;
		const next: Record<string, ParticipantState> = {};
		items.forEach((p, index) => {
			next[participantKey(p, index)] = { loading: true, reagentId: null, smiles: null };
		});
		participantState = next;
		await Promise.all(
			items.map(async (p, index) => {
				const key = participantKey(p, index);
				try {
					const match = await findLocalReagent(p);
					if (run === participantGeneration)
						participantState[key] = {
							loading: false,
							reagentId: match?.id ?? null,
							smiles: match?.smiles ?? null
						};
				} catch {
					if (run === participantGeneration)
						participantState[key] = { loading: false, reagentId: null, smiles: null };
				}
			})
		);
	}

	$effect(() => {
		const items = participants;
		if (!items.length) {
			participantState = {};
			return;
		}
		void resolveParticipantReagents(items);
	});

	/**
	 * PubChem's xref is the only exact ChEBI→CID door; its autocomplete is
	 * name-based and happily returns an unrelated compound for `CHEBI:…`.
	 * The record itself is still written through SPD's import door.
	 */
	async function pubchemCidForChebi(chebi: string): Promise<string | null> {
		try {
			const res = await fetch(
				`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/xref/RegistryID/${encodeURIComponent(chebi)}/cids/JSON`
			);
			if (!res.ok) return null;
			const doc = (await res.json()) as { IdentifierList?: { CID?: Array<number | string> } };
			const cid = doc.IdentifierList?.CID?.[0];
			return cid == null ? null : String(cid);
		} catch {
			return null;
		}
	}

	async function participantPubchemCid(p: Participant): Promise<string | null> {
		const chebi = participantChebi(p);
		let cid = chebi ? await pubchemCidForChebi(chebi) : null;
		if (!cid) {
			const query = (p.name ?? '').trim();
			if (!query) return null;
			const found = await external.search('pubchem', query, 5);
			// Autocomplete returns near-matches; a generic class name like
			// "a monocarboxylic acid amide" would otherwise import a random
			// derivative. Only an exact title is the same compound.
			const hit = found.items.find((row) => sameName(row.title, p.name));
			cid = hit?.externalId ?? null;
		}
		return cid;
	}

	async function importParticipant(p: Participant, key: string) {
		if (importingParticipant) return;
		importingParticipant = key;
		try {
			const cid = await participantPubchemCid(p);
			if (!cid) throw new Error(tr('reaction_pubchem_not_found'));
			const imported = await external.import('pubchem', cid);
			await goto(imported.route);
		} catch (e) {
			toastErr(e);
		} finally {
			importingParticipant = '';
		}
	}

	/** Fill an empty equation slot in place: pull the compound from PubChem
	 *  through SPD's import door and draw the stored structure, keeping the
	 *  reader on the reaction instead of jumping to the reagent page. */
	async function loadParticipantStructure(p: Participant, key: string) {
		if (importingParticipant) return;
		importingParticipant = key;
		try {
			const cid = await participantPubchemCid(p);
			if (!cid) throw new Error(tr('reaction_pubchem_not_found'));
			const imported = await external.import('pubchem', cid);
			const reagent = await reagents.get(imported.publicId);
			const smiles =
				String(reagent.isomericSmiles ?? '').trim() || String(reagent.smiles ?? '').trim();
			if (!smiles) throw new Error(tr('reaction_structure_not_found'));
			participantState[key] = { loading: false, reagentId: imported.publicId, smiles };
		} catch (e) {
			toastErr(e);
		} finally {
			importingParticipant = '';
		}
	}

	async function openRelatedReaction(rheaId: string, localId: string | null) {
		if (!rheaId || importingRelated) return;
		if (localId) {
			await goto(`/reactions/${localId}`);
			return;
		}
		const externalId = rheaId.replace(/^RHEA:/i, '').trim();
		if (!externalId) return;
		importingRelated = rheaId;
		try {
			const imported = await external.import('rhea', externalId);
			await goto(imported.route);
		} catch (e) {
			toastErr(e);
		} finally {
			importingRelated = '';
		}
	}

	const participantViews = $derived(
		participants.map((p, index) => ({ p, key: participantKey(p, index), index }))
	);
	const equationLeft = $derived(participantViews.filter((view) => view.p.side === 'left'));
	const equationRight = $derived(participantViews.filter((view) => view.p.side === 'right'));
	const canComposeEquation = $derived(equationLeft.length > 0 && equationRight.length > 0);

	const structuredParticipants = $derived(
		participants.filter((p) => typeof p.smiles === 'string' && p.smiles.trim() !== '')
	);
	const goTerms = $derived(asList(row?.goTerms).filter((g) => g && (g.id || g.label)));
	const crossRefs = $derived(
		asList(row?.crossReferences).filter((c) => c && (c.database || c.accession))
	);
	const related = $derived(
		asList(row?.relatedReactions).filter((r) => r && (r.relation || r.id || r.equation))
	);
	$effect(() => {
		const items = related;
		if (!items.length) {
			relatedState = {};
			return;
		}
		void resolveRelatedReactions(items);
	});
	const publications = $derived(asList(row?.publications).filter((p) => p && (p.database || p.id)));
	const directions = $derived(
		asList(row?.directions).filter((d) => d && (d.direction || d.id || d.equation))
	);

	const ecList = $derived.by((): string[] => {
		const values = asList(row?.ecNumbers).filter(
			(v): v is string => typeof v === 'string' && v.trim() !== ''
		);
		const primary = row?.ecNumber;
		if (primary && !values.includes(primary)) values.push(primary);
		return [...new Set(values)];
	});

	const enzymeCount = $derived.by(() => {
		const n = row?.enzymeCount;
		return typeof n === 'number' && Number.isFinite(n) ? n : null;
	});
	const enzymes = $derived(
		asList(row?.enzymes).filter((e) => e && (e.accession || e.name || e.ecNumber))
	);
	/**
	 * The upstream list addresses one protein per accession, so a reaction
	 * catalysed by a large family arrives as hundreds of rows that all read
	 * "amidase". Without an organism column they are indistinguishable to the
	 * reader, so group by the only fields the table actually shows and keep a
	 * representative accession for the open action.
	 */
	const enzymeGroups = $derived.by(() => {
		const groups = new Map<string, { enzyme: (typeof enzymes)[number]; count: number }>();
		for (const enzyme of enzymes) {
			const key = `${enzyme.name ?? ''}|${enzyme.ecNumber ?? ''}|${enzyme.reviewed ?? ''}`;
			const existing = groups.get(key);
			if (existing) existing.count += 1;
			else groups.set(key, { enzyme, count: 1 });
		}
		return [...groups.values()];
	});

	function boolLabel(v: boolean | number): string {
		return Boolean(v) ? tr('common_yes') : tr('common_no');
	}
	const reversibleLabel = $derived.by(() => {
		const v = row?.reversible;
		return v == null ? null : boolLabel(v);
	});
	const balancedLabel = $derived.by(() => {
		const v = row?.chemicallyBalanced;
		return v == null ? null : boolLabel(v);
	});
	const transportLabel = $derived.by(() => {
		const v = row?.transport;
		return v == null ? null : boolLabel(v);
	});

	const hasInfo = $derived(
		Boolean(row?.equation?.trim()) ||
			enzymeCount !== null ||
			ecList.length > 0 ||
			reversibleLabel !== null ||
			balancedLabel !== null ||
			transportLabel !== null
	);
	const hasEnzymes = $derived(
		ecList.length > 0 || goTerms.length > 0 || enzymeCount !== null || enzymes.length > 0
	);

	let tab = $state('overview');
	const tabItems = $derived.by(() => {
		const items: Array<{ key: string; label: string; badge?: number }> = [
			{ key: 'overview', label: tr('tab_overview') }
		];
		if (participants.length || structuredParticipants.length) {
			items.push({
				key: 'participants',
				label: tr('tab_participants'),
				badge: participants.length
			});
		}
		if (hasEnzymes) {
			items.push({
				key: 'enzymes',
				label: tr('tab_enzymes'),
				badge: enzymes.length || enzymeCount || 0
			});
		}
		if (
			row?.rheaId ||
			crossRefs.length ||
			directions.length ||
			related.length ||
			publications.length
		) {
			items.push({ key: 'evidence', label: tr('tab_evidence') });
		}
		items.push({ key: 'community', label: tr('tab_community') });
		return items;
	});
	$effect(() => {
		if (tabItems.length && !tabItems.some((item) => item.key === tab)) tab = 'overview';
	});

	function chebiNumeric(value: string | null | undefined): string {
		return String(value ?? '').replace(/^CHEBI:/i, '');
	}
	function sideLabel(value: string | null | undefined): string {
		if (value === 'left') return tr('reaction_side_left');
		if (value === 'right') return tr('reaction_side_right');
		return value || '—';
	}
	function sideTone(value: string | null | undefined): string {
		if (value === 'left') return 'info';
		if (value === 'right') return 'muted';
		return 'neutral';
	}
	function directionLabel(value: string | null | undefined): string {
		const key = String(value ?? '').replace(/-/g, '_');
		return key ? tr(`reaction_direction_${key}`) : '—';
	}
	function directionTone(value: string | null | undefined): string {
		if (value === 'bidirectional') return 'info';
		if (value === 'left-to-right' || value === 'right-to-left') return 'ok';
		return 'muted';
	}
	function relationLabel(value: string | null | undefined): string {
		return value ? tr(`reaction_relation_${value}`) : '—';
	}
	function relationTone(value: string | null | undefined): string {
		return value === 'parent' ? 'info' : value === 'child' ? 'muted' : 'neutral';
	}
</script>

{#snippet participantFigure(p: Participant, key: string)}
	{@const state = participantState[key]}
	{@const smiles = String(p.smiles ?? '').trim() || (state?.smiles ?? '')}
	<div class="flex w-40 shrink-0 flex-col items-center gap-1">
		{#if smiles}
			<MoleculeViewer {smiles} height="140px" bare />
		{:else if state?.loading}
			<div
				class="flex h-[140px] w-full items-center justify-center border border-dashed px-2 text-center text-xs text-muted-foreground"
			>
				{tr('common_loading')}
			</div>
		{:else}
			<button
				type="button"
				class="flex h-[140px] w-full items-center justify-center border border-dashed px-2 text-center text-xs text-muted-foreground hover:border-primary hover:text-foreground disabled:opacity-60"
				disabled={importingParticipant === key}
				title={tr('reaction_fetch_pubchem')}
				onclick={() => loadParticipantStructure(p, key)}
			>
				{importingParticipant === key
					? tr('reaction_loading_structure')
					: tr('reaction_load_structure')}
			</button>
		{/if}
		{#if state?.loading}
			<span class="text-xs text-muted-foreground">{p.name ?? '—'}</span>
		{:else if state?.reagentId}
			<a
				class="inline-flex items-center text-xs underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
				href={reagentHref(state.reagentId)}
				title={p.name ?? ''}
				>{p.name ?? '—'}</a
			>
		{:else}
			<button
				type="button"
				class="inline-flex items-center text-xs underline decoration-dotted underline-offset-2 hover:decoration-primary disabled:opacity-60"
				disabled={importingParticipant === key}
				title={tr('reaction_fetch_pubchem')}
				onclick={() => importParticipant(p, key)}
			>
				{p.name ?? '—'}{#if importingParticipant === key}<span class="ml-0.5">…</span>{/if}
			</button>
		{/if}
	</div>
{/snippet}

{#if error}
	<div
		class="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
	>
		{error}
	</div>
{:else if row}
	<div class="space-y-4">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<EntityBreadcrumb
					listHref="/reactions"
					listLabel={tr('browse_reactions')}
					current={String(row.name ?? '')}
				/>
				<h1 class="mt-1 text-2xl font-bold break-words">{row.name}</h1>
				<p class="mt-1 text-xs text-muted-foreground">
					<code class="font-mono break-all">{row.id}</code>
				</p>
			</div>
			<PageTools />
			<IssuePanel entityType="reaction" entityId={String(row.id)} />
		</div>

		<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
			<Button
				variant="outline"
				class="h-auto flex-col items-start gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'enzymes')}
			>
				<span class="text-sm font-semibold tabular-nums">{enzymeCount ?? enzymes.length}</span>
				<span class="text-[10px] text-muted-foreground">{tr('tab_enzymes')}</span>
			</Button>
			<Button
				variant="outline"
				class="h-auto flex-col items-start gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'participants')}
			>
				<span class="text-sm font-semibold tabular-nums">{participants.length}</span>
				<span class="text-[10px] text-muted-foreground">{tr('tab_participants')}</span>
			</Button>
			<Button
				variant="outline"
				class="h-auto flex-col items-start gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'evidence')}
			>
				<span class="text-sm font-semibold tabular-nums">{directions.length}</span>
				<span class="text-[10px] text-muted-foreground">{tr('reaction_directions_title')}</span>
			</Button>
			<Button
				variant="outline"
				class="h-auto flex-col items-start gap-0 whitespace-normal py-2"
				onclick={() => (tab = 'evidence')}
			>
				<span class="text-sm font-semibold tabular-nums">{publications.length}</span>
				<span class="text-[10px] text-muted-foreground">{tr('reaction_publications_title')}</span>
			</Button>
		</div>

		<Tabs bind:active={tab} items={tabItems} />

		{#if tab === 'overview'}
			{#if hasInfo}
				<Section title={tr('reaction_information_title')}>
					{#if row.equation?.trim() || canComposeEquation}
						<div class="border-b pb-3">
							<p class="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
								{tr('f_equation')}
							</p>
							{#if canComposeEquation}
								<div class="mt-2 overflow-x-auto">
									<div class="flex min-w-max items-start justify-center gap-3 px-1 py-2">
										{#each equationLeft as view, i (view.key)}
											{#if i > 0}<span class="mt-16 text-lg text-muted-foreground">+</span>{/if}
											{@render participantFigure(view.p, view.key)}
										{/each}
										<span class="mt-16 text-lg text-muted-foreground">=</span>
										{#each equationRight as view, i (view.key)}
											{#if i > 0}<span class="mt-16 text-lg text-muted-foreground">+</span>{/if}
											{@render participantFigure(view.p, view.key)}
										{/each}
									</div>
								</div>
								<p class="mt-1 text-[10px] text-muted-foreground">
									{tr('reaction_equation_hint')}
								</p>
							{:else}
								<code class="mt-1 block font-mono text-sm leading-6 break-words whitespace-pre-wrap"
									>{row.equation}</code
								>
							{/if}
						</div>
					{/if}
					<dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
						{#if enzymeCount !== null}
							<dt class="text-muted-foreground">{tr('f_enzymeCount')}</dt>
							<dd class="tabular-nums">{enzymeCount}</dd>
						{/if}
						{#if ecList.length}
							<dt class="text-muted-foreground">{tr('f_ecNumber')}</dt>
							<dd class="font-mono text-xs">{ecList.join(', ')}</dd>
						{/if}
						{#if reversibleLabel !== null}
							<dt class="text-muted-foreground">{tr('f_reversible')}</dt>
							<dd>{reversibleLabel}</dd>
						{/if}
						{#if balancedLabel !== null}
							<dt class="text-muted-foreground">{tr('f_chemicallyBalanced')}</dt>
							<dd>{balancedLabel}</dd>
						{/if}
						{#if transportLabel !== null}
							<dt class="text-muted-foreground">{tr('f_transport')}</dt>
							<dd>{transportLabel}</dd>
						{/if}
					</dl>
				</Section>
			{/if}
			{#if row.comment?.trim()}
				<Section title={tr('reaction_comments_title')} collapsible>
					<p class="text-sm leading-6 break-words whitespace-pre-wrap">{row.comment}</p>
				</Section>
			{/if}
			{#if !hasInfo && !row.comment?.trim()}
				<p class="text-sm text-muted-foreground">{tr('catalog_empty_tab')}</p>
			{/if}
			<RelationsPanel entityType="reaction" entityId={String(row.id)} />
		{:else if tab === 'participants'}
			{#if participants.length}
				<Section title={tr('reaction_participants_title')}>
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b text-left text-xs text-muted-foreground">
									<th class="py-1.5 pr-3 font-medium">{tr('f_side')}</th>
									<th class="py-1.5 pr-3 font-medium">{tr('reaction_col_participant')}</th>
									<th class="py-1.5 pr-3 font-medium">{tr('reaction_col_reagent')}</th>
								</tr>
							</thead>
							<tbody>
								{#each participantViews as view (view.key)}
									{@const p = view.p}
									{@const state = participantState[view.key]}
									<tr class="border-b border-b/60 last:border-0">
										<td class="py-1.5 pr-3"
											><Badge tone={sideTone(p.side)}>{sideLabel(p.side)}</Badge></td
										>
										<td class="py-1.5 pr-3">
											{#if state?.reagentId}
												<a
													class="underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
													href={reagentHref(state.reagentId)}>{p.name ?? '—'}</a
												>
											{:else}
												{p.name ?? '—'}
											{/if}
										</td>
										<td class="py-1.5 pr-3">
											{#if state?.loading}
												<span class="text-xs text-muted-foreground"
													>{tr('reaction_reagent_resolving')}</span
												>
											{:else if state?.reagentId}
												<a
													class="text-xs underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
													href={reagentHref(state.reagentId)}>{tr('reaction_open_reagent')}</a
												>
											{:else}
												<Button
													size="xs"
													variant="outline"
													disabled={importingParticipant === view.key}
													onclick={() => importParticipant(p, view.key)}
												>
													{importingParticipant === view.key
														? tr('reaction_fetching_pubchem')
														: tr('reaction_fetch_pubchem')}
												</Button>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</Section>
			{/if}
			{#if structuredParticipants.length}
				<Section title={tr('reaction_structures_title')}>
					<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						{#each structuredParticipants as p, i (`${p.chebiId ?? p.name}-structure-${i}`)}
							<div>
								<p class="mb-1 text-xs font-semibold">{p.name ?? '—'}</p>
								<MoleculeViewer smiles={String(p.smiles)} height="240px" />
							</div>
						{/each}
					</div>
				</Section>
			{/if}
			{#if !participants.length && !structuredParticipants.length}
				<p class="text-sm text-muted-foreground">{tr('catalog_empty_tab')}</p>
			{/if}
		{:else if tab === 'enzymes'}
			{#if hasEnzymes}
				<Section title={tr('reaction_enzymes_title')}>
					{#if enzymeCount !== null}
						<div class="flex flex-wrap items-baseline gap-2 border-b pb-2">
							<span class="text-lg font-semibold tabular-nums">{enzymeCount}</span>
							<span class="text-xs text-muted-foreground">{tr('reaction_uniprotkb_proteins')}</span>
						</div>
						<p class="mt-1 text-xs text-muted-foreground">{tr('reaction_uniprotkb_count_hint')}</p>
					{/if}
					{#if enzymeGroups.length}
						<p class="mt-2 text-xs text-muted-foreground">
							{tr('reaction_enzymes_group_hint', {
								groups: enzymeGroups.length,
								rows: enzymes.length,
								total: enzymeCount ?? enzymes.length
							})}
						</p>
						<div class="mt-2 overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b text-left text-xs text-muted-foreground">
										<th class="py-1.5 pr-3 font-medium">{tr('reaction_col_protein')}</th>
										<th class="py-1.5 pr-3 font-medium">{tr('f_ecNumber')}</th>
										<th class="py-1.5 pr-3 font-medium">{tr('f_reviewed')}</th>
										<th class="py-1.5 pr-3 font-medium">{tr('catalog_action')}</th>
									</tr>
								</thead>
								<tbody>
									{#each enzymeGroups as group, i (`${group.enzyme.name ?? ''}-${group.enzyme.ecNumber ?? ''}-${i}`)}
										{@const e = group.enzyme}
										<tr class="border-b border-b/60 last:border-0">
											<td class="py-1.5 pr-3">
												{e.name || tr('reaction_protein_unnamed')}
												{#if group.count > 1}
													<span class="ml-1.5 font-mono text-[11px] text-muted-foreground"
														>×{group.count}</span
													>
												{/if}
											</td>
											<td class="py-1.5 pr-3 font-mono text-xs">{e.ecNumber ?? '—'}</td>
											<td class="py-1.5 pr-3">
												{#if e.reviewed === true}
													<Badge tone="ok">{tr('reaction_reviewed')}</Badge>
												{:else if e.reviewed === false}
													<Badge tone="muted">{tr('reaction_unreviewed')}</Badge>
												{:else}
													<span class="text-muted-foreground">—</span>
												{/if}
											</td>
											<td class="py-1.5 pr-3 text-right">
												{#if e.accession}
													<Button
														size="xs"
														variant="ghost"
														disabled={importingEnzyme === e.accession}
														onclick={() => openEnzyme(e.accession)}
													>
														{importingEnzyme === e.accession
															? tr('catalog_importing')
															: tr('catalog_open')}
													</Button>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
					{#if ecList.length}
						<div class="mt-3">
							<p class="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
								{tr('f_ecNumber')}
							</p>
							<p class="mt-1 break-words">{ecList.join(' · ')}</p>
						</div>
					{/if}
					{#if goTerms.length}
						<div class="mt-3">
							<p class="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
								{tr('reaction_go_terms')}
							</p>
							<ul class="mt-1 space-y-0.5">
								{#each goTerms as g, i (`${g.id ?? g.label}-${i}`)}
									<li class="text-sm">
										<span>{g.label ?? g.id ?? '—'}</span>
										{#if g.label && g.id}<code class="ml-1 font-mono text-xs text-muted-foreground"
												>{g.id}</code
											>{/if}
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</Section>
			{:else}
				<p class="text-sm text-muted-foreground">{tr('catalog_empty_tab')}</p>
			{/if}
		{:else if tab === 'evidence'}
			<div class="space-y-3">
				{#if crossRefs.length}
					<Section title={tr('f_crossReferences')} collapsible>
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b text-left text-xs text-muted-foreground">
										<th class="py-1.5 pr-3 font-medium">{tr('f_database')}</th>
										<th class="py-1.5 pr-3 font-medium">{tr('f_accession')}</th>
									</tr>
								</thead>
								<tbody>
									{#each crossRefs as c, i (`${c.database}-${c.accession}-${i}`)}
										<tr class="border-b border-b/60 last:border-0">
											<td class="py-1.5 pr-3">{c.database ?? '—'}</td>
											<td class="py-1.5 pr-3 font-mono text-xs">{c.accession ?? '—'}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</Section>
				{/if}
				{#if directions.length}
					<Section title={tr('reaction_directions_title')} collapsible>
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b text-left text-xs text-muted-foreground">
										<th class="py-1.5 pr-3 font-medium">{tr('f_direction')}</th>
										<th class="py-1.5 pr-3 font-medium">{tr('f_equation')}</th>
									</tr>
								</thead>
								<tbody>
									{#each directions as d, i (`${d.id ?? d.direction}-${i}`)}
										<tr class="border-b border-b/60 last:border-0">
											<td class="py-1.5 pr-3">
												<Badge tone={directionTone(d.direction)}
													>{directionLabel(d.direction)}</Badge
												>
											</td>
											<td class="py-1.5 pr-3 text-xs leading-5 break-words">{d.equation ?? '—'}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</Section>
				{/if}
				{#if related.length}
					<Section title={tr('reaction_related_title')} collapsible>
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b text-left text-xs text-muted-foreground">
										<th class="py-1.5 pr-3 font-medium">{tr('f_relation')}</th>
										<th class="py-1.5 pr-3 font-medium">{tr('catalog_action')}</th>
										<th class="py-1.5 pr-3 font-medium">{tr('f_equation')}</th>
									</tr>
								</thead>
								<tbody>
									{#each related as r, i (`${r.id ?? r.relation}-${i}`)}
										<tr class="border-b border-b/60 last:border-0">
											<td class="py-1.5 pr-3">
												<Badge tone={relationTone(r.relation)}>{relationLabel(r.relation)}</Badge>
											</td>
											<td class="py-1.5 pr-3 text-xs">
												{#if r.id}
													{@const state = relatedState[relatedKey(r, i)]}
													<button
														type="button"
														class="underline decoration-primary/40 underline-offset-2 hover:decoration-primary disabled:opacity-60"
														disabled={importingRelated === r.id || state?.loading}
														onclick={() => openRelatedReaction(String(r.id), state?.reactionId ?? null)}
													>
														{importingRelated === r.id
															? tr('catalog_importing')
															: state?.loading
																? '…'
																: state?.reactionId
																	? tr('reaction_related_open')
																	: tr('reaction_related_import')}
													</button>
												{:else}
													—
												{/if}
											</td>
											<td class="py-1.5 pr-3 text-xs leading-5 break-words">{r.equation ?? '—'}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</Section>
				{/if}
				{#if publications.length}
					<Section
						title={`${tr('reaction_publications_title')} · ${publications.length}`}
						collapsible
					>
						<ul class="divide-y text-sm">
							{#each publications as p, i (`${p.database}-${p.id}-${i}`)}
								<li class="flex flex-wrap items-center gap-2 py-1.5">
									<span>{p.database ?? '—'}</span>
									<span class="font-mono text-xs break-all">{p.id ?? '—'}</span>
								</li>
							{/each}
						</ul>
					</Section>
				{/if}
				{#if !crossRefs.length && !directions.length && !related.length && !publications.length}
					<p class="text-sm text-muted-foreground">{tr('catalog_empty_tab')}</p>
				{/if}
			</div>
		{:else if tab === 'community'}
			<div class="grid gap-4 lg:grid-cols-2">
				<WikiPanel entityType="reaction" entityId={String(row.id)} collapsible />
				<ReferencesPanel entityType="reaction" entityId={String(row.id)} collapsible />
			</div>
		{/if}
	</div>
{:else if loading}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{:else}
	<p class="text-sm text-muted-foreground">{tr('page_not_found')}</p>
{/if}

<svelte:head><title>{row?.name ?? tr('browse_reactions')} · SPD</title></svelte:head>
