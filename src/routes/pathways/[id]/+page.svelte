<script lang="ts">
	import { page } from '$app/state';
	import { entities, enzymeReactions, pathways } from '$lib/api/client';
	import type { PathwayTopology } from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr, fieldLabel } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import Tabs from '$lib/components/Tabs.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import WikiPanel from '$lib/components/WikiPanel.svelte';
	import ReferencesPanel from '$lib/components/ReferencesPanel.svelte';
	import RelationsPanel from '$lib/components/RelationsPanel.svelte';
	import PathwayViewer from '$lib/components/PathwayViewer.svelte';
	import Input from '$lib/components/Input.svelte';
	import Textarea from '$lib/components/Textarea.svelte';
	import GripVerticalIcon from '@lucide/svelte/icons/grip-vertical';

	const id = $derived(page.params.id ?? '');

	let row = $state<Record<string, unknown> | null>(null);
	let error = $state('');
	let steps = $state<Record<string, unknown>[]>([]);
	let tab = $state('overview');
	let firstLoad = true;
	const topology = $derived((row?.topology as PathwayTopology | null | undefined) ?? null);

	// steps have their own editor; every other scalar is a key fact, and any
	// leftover object (upstream source, metadata) stays behind a disclosure.
	// Reactome's stable id is an upstream accession, not a curated fact; the
	// page never prints upstream accessions.
	const CURATED = new Set([
		'id',
		'name',
		'description',
		'reactomeId',
		'createdAt',
		'updatedAt',
		'steps'
	]);
	const otherScalars = $derived(
		row
			? Object.entries(row).filter(
					([k, v]) => !CURATED.has(k) && (v === null || typeof v !== 'object')
				)
			: []
	);

	async function load() {
		try {
			row = (await pathways.get(id)) as unknown as Record<string, unknown>;
			steps = Array.isArray(row.steps) ? (row.steps as Record<string, unknown>[]) : [];
			// Lead with the diagram when the pathway has one; a reload after
			// a step edit must not yank the reader back from another tab.
			if (firstLoad) {
				firstLoad = false;
				if (row.topology) tab = 'diagram';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}
	$effect(() => void load());

	// ---- reaction steps -----------------------------------------------------
	// One ordered list. When SPD has no registered steps yet, the imported
	// upstream topology is the starting list: a Researcher binds each row to
	// an existing SPD reaction by id, edits/removes rows, and drags the order.
	// Saving files the list as a correction; editorial review is what writes
	// `pathway_steps`. There is no second read-only copy.
	interface DraftStep {
		key: string;
		reactionId: string;
		reactionName: string;
		/** upstream topology label, kept so unbinding restores the source row */
		sourceName?: string;
		equation?: string;
		enzymeId?: string;
		upstream?: boolean;
	}

	const storedSteps = $derived.by<DraftStep[]>(() =>
		steps
			.map((step) => {
				const reaction = (step.reaction ?? {}) as Record<string, unknown>;
				const reactionId = String(reaction.id ?? step.reactionId ?? '');
				return {
					key: `spd:${reactionId}`,
					reactionId,
					reactionName: String(reaction.name ?? step.reactionName ?? reactionId),
					enzymeId: step.enzymeId ? String(step.enzymeId) : undefined
				};
			})
			.filter((step) => step.reactionId)
	);

	// The list the page shows: curated SPD steps once they exist, otherwise
	// the upstream topology rows waiting to be bound.
	const displaySteps = $derived.by<DraftStep[]>(() => {
		if (storedSteps.length) return storedSteps;
		return (topology?.reactions ?? []).map((reaction) => ({
			key: `up:${reaction.id}`,
			reactionId: '',
			reactionName: reaction.name,
			sourceName: reaction.name,
			equation: reaction.equation ?? undefined,
			upstream: true
		}));
	});

	let editing = $state(false);
	let draft = $state<DraftStep[]>([]);
	let newReactionId = $state('');
	let addBusy = $state(false);
	let addError = $state('');
	let reason = $state('');
	let saving = $state(false);
	let filedId = $state('');
	let dragIndex = $state<number | null>(null);

	function startEdit() {
		draft = displaySteps.map((step) => ({ ...step }));
		reason = '';
		addError = '';
		newReactionId = '';
		filedId = '';
		editing = true;
	}
	function cancelEdit() {
		editing = false;
		draft = [];
		addError = '';
		newReactionId = '';
		reason = '';
	}
	function specOf(step: DraftStep) {
		return step.enzymeId
			? { reactionId: step.reactionId, enzymeId: step.enzymeId }
			: { reactionId: step.reactionId };
	}
	function reactionOf(step: DraftStep) {
		return step.reactionId.trim();
	}
	async function bindDraftReaction(index: number) {
		const step = draft[index];
		if (!step) return;
		addError = '';
		const key = reactionOf(step);
		if (!key) {
			step.reactionName = step.sourceName ?? '';
			return;
		}
		if (draft.some((row, i) => i !== index && reactionOf(row) === key)) {
			addError = tr('pathway_steps_duplicate');
			return;
		}
		try {
			const reaction = await enzymeReactions.get(key);
			if (draft.some((row, i) => i !== index && reactionOf(row) === reaction.id)) {
				addError = tr('pathway_steps_duplicate');
				return;
			}
			step.reactionId = reaction.id;
			step.reactionName = reaction.name;
		} catch (e) {
			addError = e instanceof Error ? e.message : String(e);
		}
	}
	async function addDraftReaction() {
		const key = newReactionId.trim();
		addError = '';
		if (!key) return;
		if (draft.some((step) => reactionOf(step) === key)) {
			addError = tr('pathway_steps_duplicate');
			return;
		}
		addBusy = true;
		try {
			const reaction = await enzymeReactions.get(key);
			if (draft.some((step) => reactionOf(step) === reaction.id)) {
				addError = tr('pathway_steps_duplicate');
				return;
			}
			draft = [
				...draft,
				{
					key: `spd:${reaction.id}`,
					reactionId: reaction.id,
					reactionName: reaction.name
				}
			];
			newReactionId = '';
		} catch (e) {
			addError = e instanceof Error ? e.message : String(e);
		} finally {
			addBusy = false;
		}
	}
	function removeDraftReaction(index: number) {
		draft = draft.filter((_, i) => i !== index);
	}
	function dragStart(index: number, event: DragEvent) {
		dragIndex = index;
		event.dataTransfer?.setData('text/plain', String(index));
		if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
	}
	function dragOver(index: number, event: DragEvent) {
		event.preventDefault();
		if (dragIndex === null || dragIndex === index) return;
		const next = [...draft];
		const [moved] = next.splice(dragIndex, 1);
		next.splice(index, 0, moved);
		draft = next;
		dragIndex = index;
	}
	function dragEnd() {
		dragIndex = null;
	}
	async function submitSteps() {
		if (!row || !reason.trim() || saving) return;
		addError = '';
		const bound = draft.filter((step) => reactionOf(step));
		if (bound.length === 0) {
			addError = tr('pathway_steps_bind_required');
			return;
		}
		saving = true;
		try {
			// Resolve every binding before filing, so a typo surfaces here
			// instead of sitting in the editorial queue as an unappliable row.
			// Unbound upstream rows stay out of the proposal.
			const proposed: Array<{ reactionId: string; enzymeId?: string }> = [];
			for (const step of bound) {
				const reaction = await enzymeReactions.get(reactionOf(step));
				proposed.push(
					step.enzymeId
						? { reactionId: reaction.id, enzymeId: step.enzymeId }
						: { reactionId: reaction.id }
				);
			}
			if (new Set(proposed.map((step) => step.reactionId)).size !== proposed.length) {
				addError = tr('pathway_steps_duplicate');
				return;
			}
			const result = await entities.correct(String(row.id), {
				entityType: 'pathway',
				reason: reason.trim(),
				items: [
					{
						field: 'steps',
						current: storedSteps.map(specOf),
						proposed
					}
				]
			});
			filedId = String(result.id ?? '');
			toastOk(tr('pathway_steps_filed'));
			editing = false;
			draft = [];
			reason = '';
			await load();
		} catch (e) {
			toastErr(e);
		} finally {
			saving = false;
		}
	}
	async function removePathway() {
		if (!confirm(tr('entity_remove_confirm'))) return;
		try {
			await (pathways as { remove: (i: string) => Promise<unknown> }).remove(id);
			toastOk(tr('entity_removed'));
			location.href = '/pathways';
		} catch (e) {
			toastErr(e);
		}
	}
</script>

{#if error}
	<div
		class="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
	>
		{error}
	</div>
{:else if row}
	<div class="space-y-4">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div>
				<h1 class="text-xl font-bold break-all">{String(row.name ?? '')}</h1>
				<p class="mt-1 text-xs text-muted-foreground">
					<code class="font-mono break-all">{String(row.id)}</code>
				</p>
			</div>
			<div class="flex items-center gap-2">
				<PageTools />
				<IssuePanel entityType="pathway" entityId={String(row.id)} />
				{#if session.canWrite}<Button size="sm" variant="danger" onclick={removePathway}
						>{tr('common_delete')}</Button
					>{/if}
			</div>
		</div>

		<Tabs
			bind:active={tab}
			items={[
				{ key: 'overview', label: tr('tab_overview') },
				{ key: 'diagram', label: tr('pathway_tab_diagram') },
				{
					key: 'steps',
					label: tr('pathway_steps'),
					badge: steps.length || (topology?.reactions.length ?? 0)
				},
				{ key: 'community', label: tr('protein_tab_community') }
			]}
		/>

		{#if tab === 'overview'}
			<Section title={tr('common_details')}>
				<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
					<dt class="text-muted-foreground">{tr('f_name')}</dt>
					<dd>{String(row.name ?? '—')}</dd>
					<dt class="text-muted-foreground">{tr('f_description')}</dt>
					<dd class="whitespace-pre-line break-words">
						{row.description ? String(row.description) : '—'}
					</dd>
					<dt class="text-muted-foreground">{tr('f_createdAt')}</dt>
					<dd>{row.createdAt != null ? fmtTime(Number(row.createdAt)) : '—'}</dd>
					{#if row.updatedAt != null}
						<dt class="text-muted-foreground">{tr('f_updatedAt')}</dt>
						<dd>{fmtTime(Number(row.updatedAt))}</dd>
					{/if}
					{#each otherScalars as [k, v] (k)}
						<dt class="text-muted-foreground">{fieldLabel(k)}</dt>
						<dd class="break-words">{v == null || v === '' ? '—' : String(v)}</dd>
					{/each}
				</dl>
			</Section>
		{:else if tab === 'diagram'}
			{#if topology}
				<PathwayViewer {topology} />
			{:else}
				<Section title={tr('pathway_tab_diagram')}>
					<p class="text-sm text-muted-foreground">{tr('pathway_diagram_empty')}</p>
				</Section>
			{/if}
		{:else if tab === 'steps'}
			<Section title={tr('pathway_steps')}>
				<p class="mb-2 text-xs text-muted-foreground">{tr('pathway_steps_spd_hint')}</p>

				{#if filedId}
					<p
						class="mb-2 rounded-none bg-emerald-50 p-2 text-xs text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200"
					>
						{tr('pathway_steps_filed')} ·
						<a class="font-mono underline" href={`/corrections/${filedId}`}>{filedId}</a>
						<span class="ml-1">{tr('issue_queued_note')}</span>
					</p>
				{/if}

				{#if editing}
					{#if draft.length === 0}
						<p class="text-sm text-muted-foreground">{tr('pathway_steps_empty')}</p>
					{:else}
						<ol class="space-y-1">
							{#each draft as step, i (step.key)}
								<li
									class="rounded-none border px-2 py-1.5 text-sm transition-opacity"
									class:opacity-40={dragIndex === i}
									draggable="true"
									ondragstart={(event) => dragStart(i, event)}
									ondragover={(event) => dragOver(i, event)}
									ondrop={(event) => {
										event.preventDefault();
										dragEnd();
									}}
									ondragend={dragEnd}
								>
									<div class="flex flex-wrap items-center gap-2">
										<GripVerticalIcon class="size-4 shrink-0 cursor-grab text-muted-foreground" />
										<span class="tabular-nums text-xs text-muted-foreground">{i + 1}.</span>
										{#if step.reactionId}
											<a class="font-medium underline" href={`/reactions/${step.reactionId}`}
												>{step.reactionName}</a
											>
										{:else}
											<span class="font-medium">{step.reactionName}</span>
											<Badge tone="muted">{tr('pathway_steps_unbound')}</Badge>
										{/if}
										{#if step.enzymeId}
											<span class="text-xs text-muted-foreground"
												>{tr('pathway_enzyme')}:
												<a class="underline" href={`/enzymes/${step.enzymeId}`}>{step.enzymeId}</a
												></span
											>
										{/if}
										<Button
											size="xs"
											variant="ghost"
											class="ml-auto text-muted-foreground hover:text-destructive"
											onclick={() => removeDraftReaction(i)}
											aria_label={tr('form_kv_remove')}
											title={tr('form_kv_remove')}>×</Button
										>
									</div>
									<div class="mt-1 flex flex-wrap items-center gap-2 pl-6">
										<Input
											name={`pw_bind_${i}`}
											class="h-7 w-72 font-mono text-xs"
											placeholder="spd:reaction:…"
											bind:value={step.reactionId}
											onblur={() => void bindDraftReaction(i)}
											onkeydown={(event) => {
												if (event.key === 'Enter') {
													event.preventDefault();
													void bindDraftReaction(i);
												}
											}}
										/>
										<span class="text-xs text-muted-foreground"
											>{tr('pathway_steps_bind_hint')}</span
										>
									</div>
									{#if step.equation}
										<p class="mt-0.5 pl-6 font-mono text-xs break-words text-muted-foreground">
											{step.equation}
										</p>
									{/if}
								</li>
							{/each}
						</ol>
					{/if}

					<div class="mt-3 flex flex-wrap items-end gap-2">
						<label class="min-w-64 flex-1 text-xs">
							<span class="mb-1 block text-muted-foreground">{tr('pathway_steps_add_hint')}</span>
							<Input
								name="pw_reaction"
								class="h-8 w-full font-mono"
								placeholder="spd:reaction:…"
								bind:value={newReactionId}
								onkeydown={(event) => {
									if (event.key === 'Enter') {
										event.preventDefault();
										void addDraftReaction();
									}
								}}
							/>
						</label>
						<Button
							size="sm"
							variant="outline"
							onclick={addDraftReaction}
							disabled={addBusy || !newReactionId.trim()}>{tr('pathway_steps_add')}</Button
						>
					</div>
					{#if addError}<p class="mt-1 text-xs text-destructive">{addError}</p>{/if}
					<p class="mt-1 text-xs text-muted-foreground">{tr('pathway_steps_drag_hint')}</p>
					<p class="mt-1 text-xs text-muted-foreground">{tr('pathway_steps_unbound_note')}</p>

					<label class="mt-3 block text-xs">
						<span class="mb-1 block text-muted-foreground"
							>{tr('pathway_steps_reason')} <span class="text-destructive">*</span></span
						>
						<Textarea name="pw_steps_reason" rows={2} bind:value={reason} />
					</label>
					<p class="mt-2 text-xs text-muted-foreground">{tr('pathway_steps_research_note')}</p>
					<div class="mt-2 flex flex-wrap items-center gap-2">
						<Button size="sm" onclick={submitSteps} disabled={saving || !reason.trim()}
							>{tr('pathway_steps_submit')}</Button
						>
						<Button size="sm" variant="ghost" onclick={cancelEdit} disabled={saving}
							>{tr('common_cancel')}</Button
						>
					</div>
				{:else}
					{#if displaySteps.length === 0}
						<p class="text-sm text-muted-foreground">{tr('pathway_steps_empty')}</p>
					{:else}
						<ol class="space-y-1">
							{#each displaySteps as step, i (step.key)}
								<li class="rounded-none border px-2 py-1.5 text-sm">
									<div class="flex flex-wrap items-center gap-2">
										<span class="tabular-nums text-xs text-muted-foreground">{i + 1}.</span>
										{#if step.reactionId}
											<a class="font-medium underline" href={`/reactions/${step.reactionId}`}
												>{step.reactionName}</a
											>
										{:else}
											<span class="font-medium">{step.reactionName}</span>
											<Badge tone="muted">{tr('pathway_steps_unbound')}</Badge>
										{/if}
										{#if step.enzymeId}
											<span class="text-xs text-muted-foreground"
												>{tr('pathway_enzyme')}:
												<a class="underline" href={`/enzymes/${step.enzymeId}`}>{step.enzymeId}</a
												></span
											>
										{/if}
									</div>
									{#if step.equation}
										<p class="mt-0.5 font-mono text-xs break-words text-muted-foreground">
											{step.equation}
										</p>
									{/if}
								</li>
							{/each}
						</ol>
					{/if}
					{#if session.canWrite}
						<Button class="mt-3" size="sm" variant="outline" onclick={startEdit}
							>{tr('pathway_steps_edit')}</Button
						>
					{:else if session.signedIn}
						<p class="mt-2 text-xs text-muted-foreground">{tr('pathway_steps_research_note')}</p>
					{/if}
				{/if}
			</Section>
		{:else}
			<div class="grid gap-4 lg:grid-cols-2">
				<RelationsPanel entityType="pathway" entityId={String(row.id)} />
				<WikiPanel entityType="pathway" entityId={String(row.id ?? id)} />
				<ReferencesPanel entityType="pathway" entityId={String(row.id ?? id)} />
			</div>
		{/if}
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{/if}

<svelte:head><title>{tr('browse_pathways')} · SPD</title></svelte:head>
