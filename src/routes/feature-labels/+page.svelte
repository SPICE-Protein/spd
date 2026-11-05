<script lang="ts">
	import { featureLabels, type FeatureLabelRow } from '$lib/api/client';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import { downloadText } from '$lib/export/download';
	import Section from '$lib/components/Section.svelte';
	import Button from '$lib/components/Button.svelte';
	import PageTools from '$lib/components/PageTools.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import Input from '$lib/components/Input.svelte';
	import Select from '$lib/components/Select.svelte';
	import Textarea from '$lib/components/Textarea.svelte';
	import Dialog from '$lib/components/Dialog.svelte';

	/**
	 * The controlled feature-label vocabulary. Reading and export are public;
	 * every write is researcher-gated on the server. The page never offers a
	 * write control to a user who cannot complete it.
	 */
	const SCOPE_OPTIONS = $derived([
		{ value: '', label: tr('feature_label_all_scopes') },
		{ value: 'protein', label: tr('feature_label_scope_protein') },
		{ value: 'gene', label: tr('feature_label_scope_gene') },
		{ value: 'vector', label: tr('feature_label_scope_vector') },
		{ value: 'general', label: tr('feature_label_scope_general') }
	]);
	const EDIT_SCOPE_OPTIONS = $derived(SCOPE_OPTIONS.filter((option) => option.value !== ''));

	let rows = $state<FeatureLabelRow[]>([]);
	let loading = $state(true);
	let error = $state('');
	let scope = $state('');
	let activeOnly = $state(false);
	let dialogOpen = $state(false);
	let editing = $state<FeatureLabelRow | null>(null);
	let saving = $state(false);
	let form = $state({ scope: 'protein', key: '', label: '', description: '' });

	const canWrite = $derived(session.canWrite);
	const visible = $derived(
		rows.filter((row) => (!scope || row.scope === scope) && (!activeOnly || row.status === 'active'))
	);

	async function load() {
		loading = true;
		try {
			rows = await featureLabels.list();
			error = '';
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}
	$effect(() => void load());

	function openCreate() {
		editing = null;
		form = { scope: 'protein', key: '', label: '', description: '' };
		dialogOpen = true;
	}

	function openEdit(row: FeatureLabelRow) {
		editing = row;
		form = {
			scope: row.scope,
			key: row.key,
			label: row.label,
			description: row.description ?? ''
		};
		dialogOpen = true;
	}

	async function save() {
		if (saving) return;
		saving = true;
		try {
			if (editing) {
				await featureLabels.update(editing.id, {
					label: form.label,
					description: form.description
				});
				toastOk(tr('feature_label_saved'));
			} else {
				await featureLabels.create({
					scope: form.scope,
					key: form.key,
					label: form.label,
					description: form.description || undefined
				});
				toastOk(tr('feature_label_created'));
			}
			dialogOpen = false;
			await load();
		} catch (e) {
			toastErr(e);
		} finally {
			saving = false;
		}
	}

	async function retire(row: FeatureLabelRow) {
		if (!confirm(tr('feature_label_retire_confirm', { key: row.key }))) return;
		try {
			await featureLabels.remove(row.id);
			toastOk(tr('feature_label_retired'));
			await load();
		} catch (e) {
			toastErr(e);
		}
	}

	async function restore(row: FeatureLabelRow) {
		try {
			await featureLabels.update(row.id, { status: 'active' });
			toastOk(tr('feature_label_restored'));
			await load();
		} catch (e) {
			toastErr(e);
		}
	}

	function exportJson() {
		downloadText(
			`spd-feature-labels-${new Date().toISOString().slice(0, 10)}.json`,
			JSON.stringify(visible, null, 2),
			'application/json;charset=utf-8'
		);
	}

	function csvCell(value: string | null | undefined): string {
		const text = value ?? '';
		return `"${text.replaceAll('"', '""')}"`;
	}

	function exportCsv() {
		const header = 'scope,key,label,description,status';
		const body = visible.map((row) =>
			[row.scope, row.key, row.label, row.description, row.status].map(csvCell).join(',')
		);
		downloadText(
			`spd-feature-labels-${new Date().toISOString().slice(0, 10)}.csv`,
			[header, ...body].join('\n'),
			'text/csv;charset=utf-8'
		);
	}
</script>

<div class="space-y-4">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold">{tr('feature_label_title')}</h1>
			<p class="mt-1 text-sm text-muted-foreground">{tr('feature_label_intro')}</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<PageTools withPrint={false} />
			<Button size="sm" variant="outline" onclick={exportJson}>{tr('feature_label_export_json')}</Button>
			<Button size="sm" variant="outline" onclick={exportCsv}>{tr('feature_label_export_csv')}</Button>
			{#if canWrite}
				<Button size="sm" onclick={openCreate}>{tr('feature_label_add')}</Button>
			{/if}
		</div>
	</div>

	{#if !canWrite}
		<p class="border border-dashed bg-muted/20 p-2.5 text-xs text-muted-foreground">
			{tr('feature_label_read_only')}
		</p>
	{/if}

	<Section title={tr('feature_label_vocabulary')}>
		{#snippet actions()}
			<div class="flex flex-wrap items-center gap-2">
				<Select
					name="feature-label-scope"
					class="h-8 w-36"
					options={SCOPE_OPTIONS}
					bind:value={scope}
				/>
				<label class="flex items-center gap-1.5 text-xs text-muted-foreground">
					<input type="checkbox" bind:checked={activeOnly} />
					{tr('feature_label_active_only')}
				</label>
			</div>
		{/snippet}

		{#if error}
			<p class="text-sm text-destructive">{error}</p>
		{:else if loading}
			<p class="text-sm text-muted-foreground">{tr('common_loading')}</p>
		{:else if visible.length === 0}
			<p class="text-sm text-muted-foreground">{tr('feature_label_empty')}</p>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b text-left text-xs text-muted-foreground">
							<th class="py-1.5 pr-3">{tr('feature_label_col_scope')}</th>
							<th class="py-1.5 pr-3">{tr('feature_label_col_key')}</th>
							<th class="py-1.5 pr-3">{tr('feature_label_col_label')}</th>
							<th class="py-1.5 pr-3">{tr('feature_label_col_description')}</th>
							<th class="py-1.5 pr-3">{tr('feature_label_col_status')}</th>
							{#if canWrite}<th class="py-1.5">{tr('common_actions')}</th>{/if}
						</tr>
					</thead>
					<tbody>
						{#each visible as row (row.id)}
							<tr class="border-b align-top last:border-0">
								<td class="py-1.5 pr-3 text-xs">{tr(`feature_label_scope_${row.scope}`)}</td>
								<td class="py-1.5 pr-3"><code class="text-xs">{row.key}</code></td>
								<td class="py-1.5 pr-3">{row.label}</td>
								<td class="py-1.5 pr-3 text-muted-foreground">{row.description || '—'}</td>
								<td class="py-1.5 pr-3">
									<Badge tone={row.status === 'active' ? 'ok' : 'muted'}>
										{row.status === 'active'
											? tr('feature_label_status_active')
											: tr('feature_label_status_deprecated')}
									</Badge>
								</td>
								{#if canWrite}
									<td class="py-1.5">
										<div class="flex flex-wrap justify-end gap-1">
											<Button size="xs" variant="ghost" onclick={() => openEdit(row)}>
												{tr('common_edit')}
											</Button>
											{#if row.status === 'active'}
												<Button
													size="xs"
													variant="ghost"
													class="text-destructive"
													onclick={() => retire(row)}
												>
													{tr('feature_label_retire')}
												</Button>
											{:else}
												<Button size="xs" variant="ghost" onclick={() => restore(row)}>
													{tr('feature_label_restore')}
												</Button>
											{/if}
										</div>
									</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Section>
</div>

<Dialog
	bind:open={dialogOpen}
	onclose={() => (editing = null)}
	title={editing ? tr('feature_label_edit') : tr('feature_label_add')}
>
	<div class="space-y-3">
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="block text-xs">
				<span class="mb-1 block text-muted-foreground">{tr('feature_label_col_scope')}</span>
				<Select
					name="feature-label-form-scope"
					options={EDIT_SCOPE_OPTIONS}
					bind:value={form.scope}
					disabled={editing !== null}
				/>
			</label>
			<label class="block text-xs">
				<span class="mb-1 block text-muted-foreground">{tr('feature_label_col_key')}</span>
				<Input
					name="feature-label-form-key"
					class="font-mono"
					bind:value={form.key}
					disabled={editing !== null}
					placeholder="DOMAIN"
				/>
			</label>
		</div>
		<label class="block text-xs">
			<span class="mb-1 block text-muted-foreground">{tr('feature_label_col_label')}</span>
			<Input name="feature-label-form-label" bind:value={form.label} placeholder="Domain" />
		</label>
		<label class="block text-xs">
			<span class="mb-1 block text-muted-foreground">{tr('feature_label_col_description')}</span>
			<Textarea
				name="feature-label-form-description"
				rows={3}
				bind:value={form.description}
				placeholder={tr('feature_label_description_placeholder')}
			/>
		</label>
		<p class="text-xs text-muted-foreground">{tr('feature_label_key_immutable')}</p>
		<div class="flex justify-end gap-2">
			<Button variant="outline" onclick={() => (dialogOpen = false)} disabled={saving}>
				{tr('common_cancel')}
			</Button>
			<Button onclick={save} disabled={saving || !form.label.trim() || (!editing && !form.key.trim())}>
				{saving ? tr('common_saving') : tr('common_save')}
			</Button>
		</div>
	</div>
</Dialog>

<svelte:head><title>{tr('feature_label_title')} · SPD</title></svelte:head>
