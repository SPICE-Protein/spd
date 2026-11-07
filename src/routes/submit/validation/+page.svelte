<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { folds } from '$lib/api/client';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { shortPublicId } from '$lib/format';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import Button from '$lib/components/Button.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import ValidationForm from '$lib/components/ValidationForm.svelte';
	import TargetPicker from '$lib/components/TargetPicker.svelte';

	let foldId = $state(String(page.url.searchParams.get('foldId') ?? ''));
	let preview = $state('');
	// svelte-ignore state_referenced_locally — seed once from the deep link; the
	// picker/effect own it after mount
	let checkedId = $state(foldId.trim());

	async function checkFold(id: string) {
		preview = '';
		if (!id) {
			checkedId = '';
			return;
		}
		try {
			const rec = (await folds.get(id)) as unknown as Record<string, unknown>;
			const conf = typeof rec.confidence === 'number' ? ` · confidence ${rec.confidence.toFixed(2)}` : '';
			preview = `${shortPublicId(String(rec.id ?? id))}${conf}`;
			checkedId = String(rec.id ?? id);
			void goto(`?foldId=${encodeURIComponent(id)}`, { replaceState: true, noScroll: true });
		} catch (e) {
			preview = e instanceof Error ? e.message : String(e);
			checkedId = '';
		}
	}

	// a ?foldId= deep link arrives already-picked; validate it once so the
	// measurement form below knows the fold really exists
	let foldChecked = $state(false);
	$effect(() => {
		if (!foldChecked && foldId.trim()) {
			foldChecked = true;
			void checkFold(foldId.trim());
		}
	});
</script>

<div class="mx-auto max-w-3xl space-y-4">
	<div>
		<h1 class="flex items-center gap-1.5 text-2xl font-bold">
			{tr('submit_validation')}
			<InfoTip text={tr('submit_validation_intro')} label={`${tr('submit_validation')} — ${tr('common_more_info')}`} class="mt-1" />
		</h1>
	</div>

	{#if session.signedIn}
		<Section title={tr('validation_step_fold')} hint={tr('validation_find_fold')}>
			<TargetPicker
				entityType="fold"
				initial={foldId ? { id: foldId } : undefined}
				onpick={(h) => { foldId = h?.id ?? ''; void checkFold(foldId); }}
			/>
			{#if preview}
				<p class="mt-2 text-xs text-muted-foreground">
					{#if checkedId}<Badge tone="ok">fold</Badge> {:else}<Badge tone="bad">✕</Badge> {/if}
					<span class="ml-1 font-mono">{preview}</span>
				</p>
			{/if}
		</Section>

		{#if checkedId}
			<Section title={tr('validation_step_measure')}>
				<ValidationForm foldId={checkedId} ondone={() => (checkedId = '')} />
			</Section>
		{/if}
	{:else}
		<div class="flex items-center gap-3 rounded-none border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
			{tr('submit_login_needed')}
			<Button size="sm" onclick={() => session.signIn()}>{tr('nav_login')}</Button>
		</div>
	{/if}

	<p class="text-xs text-muted-foreground">
		{tr('validation_after_note')}
		<a class="underline" href="/leaderboard">{tr('lb_title')}</a>
	</p>
</div>

<svelte:head><title>{tr('submit_validation')} · SPD</title></svelte:head>
