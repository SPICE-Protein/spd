<script lang="ts">
	import { page } from '$app/state';
	import { families } from '$lib/api/client';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { fmtTime, shortPublicId } from '$lib/format';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import IssuePanel from '$lib/components/IssuePanel.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import Button from '$lib/components/Button.svelte';
	import WikiPanel from '$lib/components/WikiPanel.svelte';
	import ReferencesPanel from '$lib/components/ReferencesPanel.svelte';
	import Input from '$lib/components/Input.svelte'

	const id = $derived(page.params.id ?? '');

	let row = $state<Record<string, unknown> | null>(null);
	let members = $state<Record<string, unknown>[]>([]);
	let error = $state('');

	async function load() {
		try {
			row = await families.get(id);
			members = Array.isArray(row.members) ? (row.members as Record<string, unknown>[]) : [];
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}
	$effect(() => void load());

	let form = $state({ sequenceId: '', orthologOfSequenceId: '', conservedSites: '' });
	async function addMember() {
		if (!form.sequenceId) return;
		try {
			await families.addMember(id, {
				sequenceId: form.sequenceId,
				orthologOfSequenceId: form.orthologOfSequenceId || undefined,
				conservedSites: form.conservedSites ? JSON.parse(form.conservedSites) : undefined
			});
			toastOk(tr('family_member_added'));
			form = { sequenceId: '', orthologOfSequenceId: '', conservedSites: '' };
			await load();
		} catch (e) {
			toastErr(e);
		}
	}
	async function removeMember(mid: string) {
		if (!confirm(tr('entity_remove_confirm'))) return;
		try {
			await families.removeMember(id, mid);
			await load();
		} catch (e) {
			toastErr(e);
		}
	}
	async function removeFamily() {
		if (!confirm(tr('entity_remove_confirm'))) return;
		try {
			await families.remove(id);
			location.href = '/families';
		} catch (e) {
			toastErr(e);
		}
	}
</script>

{#if error}
	<div class="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
{:else if row}
	<div class="space-y-4">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div>
				<h1 class="text-xl font-bold">{String(row.name ?? '')}</h1>
				<p class="text-xs text-muted-foreground font-mono">{String(row.id)}</p>
			</div>
			<PageTools />
			<IssuePanel entityType="family" entityId={String(row.id)} />
			{#if session.signedIn}<Button size="sm" variant="danger" onclick={removeFamily}>{tr('common_delete')}</Button>{/if}
		</div>
		{#if row.description}<p class="text-sm text-muted-foreground">{String(row.description)}</p>{/if}

		<Section title={tr('family_members')}>
			{#if members.length === 0}<p class="text-sm text-muted-foreground">{tr('common_empty')}</p>
			{:else}
				<ul class="divide-y text-sm">
					{#each members as m, i (i)}
						<li class="flex flex-wrap items-center gap-2 py-1.5 text-xs">
							<a class="underline font-mono" href={`/sequences/${m.sequenceId}`}>{shortPublicId(m.sequenceId ? String(m.sequenceId) : null)}</a>
							{#if m.orthologOfSequenceId}<span class="text-muted-foreground">{tr('family_ortholog_of')} <a class="underline font-mono" href={`/sequences/${m.orthologOfSequenceId}`}>{shortPublicId(m.orthologOfSequenceId ? String(m.orthologOfSequenceId) : null)}</a></span>{/if}
							{#if session.signedIn}<Button size="xs" variant="ghost" class="ml-auto" onclick={() => removeMember(String(m.id ?? m.sequenceId))}>{tr('common_delete')}</Button>{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if session.signedIn}
				<div class="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
					<Input name="fam_seq" class="h-8 w-44" placeholder={tr('family_member_sequence')} bind:value={form.sequenceId} />
					<Input name="fam_ortholog" class="h-8 w-44" placeholder={tr('family_ortholog_optional')} bind:value={form.orthologOfSequenceId} />
					<Button size="sm" onclick={addMember}>{tr('common_create')}</Button>
				</div>
			{/if}
		</Section>

		<div class="grid gap-4 lg:grid-cols-2">
			<WikiPanel entityType="family" entityId={String(row.id ?? id)} />
			<ReferencesPanel entityType="family" entityId={String(row.id ?? id)} />
		</div>
	</div>
{:else}
	<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
{/if}

<svelte:head><title>{tr('browse_families')} · SPD</title></svelte:head>
