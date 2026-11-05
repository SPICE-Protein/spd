<script lang="ts">
	import { artifacts } from '$lib/api/client';
	import type { ArtifactRecord } from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtTime, shortPublicId } from '$lib/format';
	import Badge from './Badge.svelte';
	import StatusBadge from './StatusBadge.svelte';
	import Button from './Button.svelte';
	import UploadPanel from './UploadPanel.svelte';

	/**
	 * "Attach a file I already uploaded" — the artifact side of TargetPicker:
	 * a contributor picks from their own uploads instead of pasting an
	 * `artifact:kind:hex` string. The data source is the small dedicated
	 * GET /artifacts/mine (created_by-scoped, ≤100 newest), which carries the
	 * storage facts the personal activity feed does not: kind, byte size,
	 * completion status. Filtering by kind is client-side because 100 rows
	 * need no server search. A fresh upload rides along in a disclosure —
	 * the same move ValidationForm made standalone, now reusable everywhere.
	 *
	 * `value` is the comma-joined id string, so the wire payload is identical
	 * to what the old hand-typed list field produced: pages, buildBody and
	 * deep-link seeds all keep working unchanged.
	 */
	let {
		value = $bindable(''),
		multiple = false,
		kinds = undefined,
		defaultKind = 'raw_assay_data'
	}: {
		value?: string;
		multiple?: boolean;
		kinds?: string[];
		defaultKind?: string;
	} = $props();

	let rows = $state<ArtifactRecord[]>([]);
	let loading = $state(false);
	let error = $state('');

	const selected = $derived(
		value
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
	);
	const visible = $derived(
		kinds && kinds.length ? rows.filter((r) => kinds.includes(r.kind)) : rows
	);

	async function reload() {
		if (!session.signedIn) return;
		loading = true;
		error = '';
		try {
			rows = await artifacts.mine();
		} catch {
			// the list is a convenience; losing it never blocks a form that
			// was filled some other way (seeded value, upload disclosure)
			rows = [];
			error = tr('upload_load_failed');
		} finally {
			loading = false;
		}
	}
	$effect(() => {
		void reload();
	});

	function toggle(row: ArtifactRecord) {
		if (multiple) {
			const cur = new Set(selected);
			if (cur.has(row.id)) cur.delete(row.id);
			else cur.add(row.id);
			value = [...cur].join(', ');
		} else {
			value = selected.includes(row.id) ? '' : row.id;
		}
	}

	function removeChip(one: string) {
		value = selected.filter((x) => x !== one).join(', ');
	}

	function afterUpload(id: string) {
		value = multiple ? [...new Set([...selected, id])].join(', ') : id;
		// the freshly completed row belongs in the list, not just the chip
		void reload();
	}

	function fmtBytes(n: number | null | undefined): string {
		const v = Number(n ?? 0);
		if (v < 1024) return `${v} B`;
		if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
		return `${(v / 1024 / 1024).toFixed(2)} MB`;
	}
</script>

<div class="space-y-2">
	{#if selected.length}
		<!-- chips survive even when a deep-linked id is not (yet) in my list -->
		<div class="flex flex-wrap gap-1">
			{#each selected as one (one)}
				<span
					class="inline-flex items-center gap-1 border bg-muted/40 px-1.5 py-0.5 font-mono text-xs"
				>
					{shortPublicId(one, 14)}
					<button
						type="button"
						class="text-muted-foreground hover:text-foreground"
						aria-label={tr('common_remove')}
						onclick={() => removeChip(one)}>×</button
					>
				</span>
			{/each}
		</div>
	{/if}

	{#if !session.signedIn}
		<p class="text-xs text-muted-foreground">
			{tr('upload_signin_hint')}
			<Button size="xs" variant="ghost" onclick={() => session.signIn()}>{tr('nav_login')}</Button>
		</p>
	{:else}
		{#if error}<p class="text-xs text-amber-700 dark:text-amber-300">{error}</p>{/if}
		<div class="max-h-56 overflow-y-auto border">
			{#if loading}
				<p class="p-2 text-xs text-muted-foreground">{tr('common_loading')}</p>
			{:else if visible.length === 0}
				<p class="p-2 text-xs text-muted-foreground">
					{kinds && kinds.length ? tr('upload_none_matching') : tr('upload_none_mine')}
				</p>
			{:else}
				<ul class="divide-y">
					{#each visible as row (row.id)}
						{@const on = selected.includes(row.id)}
						<li>
							<button
								type="button"
								class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs {on
									? 'bg-emerald-500/10'
									: 'hover:bg-muted/40'}"
								onclick={() => toggle(row)}
							>
								<span class="w-4 shrink-0 font-mono" aria-hidden="true">{on ? '✓' : ''}</span>
								<Badge tone="info">{enumLabel('ak', row.kind)}</Badge>
								<span class="truncate font-mono" title={String(row.id)}
									>{shortPublicId(String(row.id), 14)}</span
								>
								<span class="shrink-0 text-muted-foreground">{fmtBytes(row.byteLength)}</span>
								<span class="hidden shrink-0 text-muted-foreground sm:inline"
									>{fmtTime(row.createdAt)}</span
								>
								<span class="ml-auto shrink-0"><StatusBadge status={row.status} ns="st" /></span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
		<details>
			<summary class="cursor-pointer text-xs text-muted-foreground">{tr('upload_new_file')}</summary
			>
			<div class="mt-2">
				<UploadPanel
					compact
					{defaultKind}
					zipOnly={defaultKind === 'supplementary_zip'}
					ondone={afterUpload}
				/>
			</div>
		</details>
	{/if}
</div>
