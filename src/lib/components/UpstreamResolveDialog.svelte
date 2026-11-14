<script lang="ts">
	// Pick one record from an upstream ladder. The dedicated catalog answers
	// first; a same-domain fallback follows and only becomes interesting when
	// the first rung is empty or degraded. `resolve` is read-only, so nothing
	// is created until the user confirms — then `import` materialises the
	// chosen record and the caller receives its route/public id.
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { external } from '$lib/api/client';
	import type {
		ExternalImportResult,
		ExternalResolveData,
		ExternalResolveItem,
		ExternalSource
	} from '$lib/api/types';
	import { tr } from '$lib/i18n';
	import { toastErr } from '$lib/state/toast.svelte';
	import Badge from './Badge.svelte';
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import InfoTip from './InfoTip.svelte';

	let {
		entityType,
		query,
		open = $bindable(false),
		onclose,
		onpicked
	}: {
		entityType: string;
		query: string;
		open?: boolean;
		onclose?: () => void;
		onpicked?: (result: ExternalImportResult) => void;
	} = $props();

	const SOURCE_TONE: Record<string, string> = {
		uniprot: 'info',
		pdb: 'neutral',
		ncbi: 'ok',
		cellosaurus: 'warn',
		pubchem: 'info',
		rhea: 'ok',
		reactome: 'info',
		brenda: 'warn'
	};

	let data = $state<ExternalResolveData | null>(null);
	let loading = $state(false);
	let error = $state('');
	let selected = $state('');
	let expanded = $state<Record<string, boolean>>({});
	let importing = $state(false);
	let importError = $state('');
	let generation = 0;

	function keyOf(item: ExternalResolveItem): string {
		return `${item.source}:${item.externalId}`;
	}

	const rungs = $derived(data?.rungs ?? []);
	const totalItems = $derived(rungs.reduce((n, rung) => n + (rung.items?.length ?? 0), 0));
	// "every rung degraded" is not an empty result: there was nothing to ask.
	const allDegraded = $derived(
		rungs.length > 0 && rungs.every((rung) => rung.degraded && (rung.items?.length ?? 0) === 0)
	);
	const selectedItem = $derived(
		rungs.flatMap((rung) => rung.items ?? []).find((item) => keyOf(item) === selected) ?? null
	);

	async function load() {
		const run = ++generation;
		loading = true;
		error = '';
		data = null;
		selected = '';
		expanded = {};
		importError = '';
		try {
			const result = await external.resolve(entityType, query);
			// A slower earlier lookup must never overwrite a newer one.
			if (run !== generation) return;
			data = result;
			// Default to the first hit of the first rung that answered; the
			// other rungs stay collapsed but remain selectable.
			const firstHit = (result.rungs ?? []).find((rung) => (rung.items?.length ?? 0) > 0);
			if (firstHit) {
				selected = keyOf(firstHit.items[0]);
				expanded = { [firstHit.source]: true };
			}
		} catch (e) {
			if (run !== generation) return;
			error = e instanceof Error ? e.message : String(e);
		} finally {
			if (run === generation) loading = false;
		}
	}

	$effect(() => {
		if (!open) {
			// Invalidate any in-flight answer when the dialog closes.
			generation++;
			return;
		}
		if (!entityType || !query) return;
		void load();
	});

	function toggle(source: ExternalSource) {
		expanded = { ...expanded, [source]: !expanded[source] };
	}

	async function confirm() {
		const item = selectedItem;
		if (!item || importing) return;
		importing = true;
		importError = '';
		try {
			const result = await external.import(item.source, item.externalId);
			importing = false;
			open = false;
			onpicked?.(result);
		} catch (e) {
			importing = false;
			importError = e instanceof Error ? e.message : String(e);
			toastErr(e);
		}
	}
</script>

<Dialog
	bind:open
	{onclose}
	title={tr('upstream_dialog_title')}
	hint={tr('upstream_dialog_hint')}
	width="max-w-2xl"
>
	<div class="space-y-3 text-sm">
		<p class="text-xs text-muted-foreground">
			<span class="font-mono">{query}</span>
			<span class="mx-1">·</span>
			{tr(`et_${entityType.replace(/-/g, '_')}`)}
		</p>

		{#if loading}
			<p class="text-muted-foreground">{tr('common_loading')}</p>
		{:else if error}
			<div
				class="rounded-none border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
			>
				<p>{tr('upstream_load_failed')}</p>
				<p class="mt-1 break-words">{error}</p>
			</div>
			<div class="flex justify-end">
				<Button size="sm" variant="outline" onclick={() => void load()}
					>{tr('upstream_retry')}</Button
				>
			</div>
		{:else if data}
			{#if totalItems === 0 && !allDegraded}
				<p class="text-muted-foreground">{tr('upstream_no_candidates')}</p>
			{/if}

			<div class="space-y-2">
				{#each rungs as rung, i (rung.source)}
					{@const items = rung.items ?? []}
					{@const isOpen = expanded[rung.source] ?? false}
					<div class="border bg-card">
						<button
							type="button"
							class="flex w-full items-center gap-2 px-2 py-1.5 text-left"
							aria-expanded={isOpen}
							title={isOpen ? tr('upstream_collapse') : tr('upstream_expand_others')}
							onclick={() => toggle(rung.source)}
						>
							<Badge tone={SOURCE_TONE[rung.source] ?? 'neutral'}
								>{tr(`ext_source_${rung.source}`)}</Badge
							>
							{#if i === 0}
								<Badge tone="ok">{tr('upstream_preferred')}</Badge>
								<InfoTip text={tr('upstream_ladder_hint')} label={tr('upstream_preferred')} />
							{/if}
							<span class="ml-auto text-xs text-muted-foreground">
								{rung.degraded ? tr('upstream_source_unavailable') : items.length}
							</span>
							<ChevronDownIcon
								class="size-4 shrink-0 text-muted-foreground transition-transform {isOpen
									? 'rotate-180'
									: ''}"
							/>
						</button>
						{#if isOpen}
							<div class="border-t px-2 py-2">
								{#if rung.degraded}
									<p class="text-xs text-amber-700 dark:text-amber-300">
										{tr('upstream_source_unavailable')}
									</p>
								{/if}
								{#if items.length === 0 && !rung.degraded}
									<p class="text-xs text-muted-foreground">{tr('upstream_rung_empty')}</p>
								{:else}
									<ul class="space-y-1.5">
										{#each items as item (keyOf(item))}
											{@const isSelected = selected === keyOf(item)}
											<li>
												<div
													class="flex flex-wrap items-center gap-2 border p-2 {isSelected
														? 'border-primary/60 bg-primary/5'
														: 'border-transparent'}"
												>
													<button
														type="button"
														class="min-w-0 flex-1 text-left"
														aria-pressed={isSelected}
														onclick={() => (selected = keyOf(item))}
													>
														<span class="block truncate text-sm font-medium">{item.title}</span>
														{#if item.subtitle}
															<span class="mt-0.5 block truncate text-xs text-muted-foreground"
																>{item.subtitle}</span
															>
														{/if}
													</button>
													<span class="flex shrink-0 flex-wrap items-center gap-2">
														<Badge tone={SOURCE_TONE[item.source] ?? 'neutral'}
															>{tr(`ext_source_${item.source}`)}</Badge
														>
														{#if item.localPublicId}
															<Badge tone="ok">{tr('upstream_in_library')}</Badge>
															{#if item.localRoute}
																<a
																	class="text-xs underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
																	href={item.localRoute}>{tr('upstream_open_local')}</a
																>
															{/if}
														{/if}
														{#if item.url}
															<a
																class="text-xs underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
																href={item.url}
																target="_blank"
																rel="noopener">{tr('ext_open_source')} ↗</a
															>
														{/if}
													</span>
												</div>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		{#if importError}
			<p
				class="rounded-none border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive"
			>
				{importError}
			</p>
		{/if}

		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (open = false)}>{tr('common_cancel')}</Button>
			<Button onclick={confirm} disabled={!selectedItem || importing}>
				{importing ? tr('upstream_binding') : tr('upstream_confirm')}
			</Button>
		</div>
	</div>
</Dialog>
