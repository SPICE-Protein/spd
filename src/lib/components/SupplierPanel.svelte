<script lang="ts">
	import { organizations } from '$lib/api/client';
	import type { OrgMembershipRow, SupplierInput } from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr, fieldLabel } from '$lib/i18n';
	import { supplierOrgOptions } from '$lib/suppliers';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from './Section.svelte';
	import Badge from './Badge.svelte';
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import Input from './Input.svelte';
	import Select from './Select.svelte';

	/**
	 * Supply records for a catalog entry: who sells it, under which catalogue
	 * number, and whether that claim is verified. Editors add and remove
	 * rows; everyone else reads the shelf.
	 */
	let {
		suppliers = [],
		add,
		remove,
		onchanged,
		collapsible = true
	}: {
		suppliers: Record<string, unknown>[];
		add: (body: SupplierInput) => Promise<unknown>;
		remove: (supplierId: string) => Promise<unknown>;
		onchanged: () => Promise<unknown>;
		collapsible?: boolean;
	} = $props();

	let showSupplier = $state(false);
	const blankSupplier = () => ({
		catalogNumber: '',
		orderUrl: '',
		orderEmail: '',
		notes: '',
		description: ''
	});
	let supForm = $state<Record<string, string>>(blankSupplier());

	// The user should never paste an organization id. Resolve the orgs they
	// lead from the session and let them pick one by name.
	let orgOptions = $state<{ value: string; label: string }[]>([]);
	let orgId = $state('');
	let orgsLoading = $state(false);
	let orgsFailed = $state(false);

	async function loadOrganizations() {
		if (!session.signedIn) return;
		orgsLoading = true;
		orgsFailed = false;
		try {
			const res = await organizations.myMemberships();
			const options = supplierOrgOptions((res.organizations ?? []) as OrgMembershipRow[]);
			orgOptions = options;
			if (options.length === 1) orgId = options[0].value;
			else if (!options.some((o) => o.value === orgId)) orgId = '';
		} catch (e) {
			orgOptions = [];
			orgId = '';
			orgsFailed = true;
			toastErr(e);
		} finally {
			orgsLoading = false;
		}
	}

	$effect(() => {
		if (showSupplier) void loadOrganizations();
	});

	async function addSupplier() {
		if (!orgId) return;
		try {
			await add({
				organizationId: orgId,
				catalogNumber: supForm.catalogNumber || undefined,
				orderUrl: supForm.orderUrl || undefined,
				orderEmail: supForm.orderEmail || undefined,
				notes: supForm.notes || undefined,
				description: supForm.description || undefined
			});
			toastOk(tr('supplier_added'));
			showSupplier = false;
			supForm = blankSupplier();
			await onchanged();
		} catch (e) {
			toastErr(e);
		}
	}

	async function removeSupplier(sid: string) {
		if (!confirm(tr('supplier_remove_confirm'))) return;
		try {
			await remove(sid);
			await onchanged();
		} catch (e) {
			toastErr(e);
		}
	}
</script>

<Section
	title={suppliers.length ? `${tr('supplier_title')} · ${suppliers.length}` : tr('supplier_title')}
	{collapsible}
>
	{#snippet actions()}
		{#if session.signedIn}<Button size="xs" variant="outline" onclick={() => (showSupplier = true)}
				>{tr('supplier_add')}</Button
			>{/if}
	{/snippet}
	{#if suppliers.length === 0}<p class="text-sm text-muted-foreground">{tr('supplier_empty')}</p>
	{:else}
		<ul class="divide-y text-sm">
			{#each suppliers as s, i (i)}
				<li class="flex flex-wrap items-center gap-2 py-1.5 text-xs">
					<span class="font-medium">{String(s.organizationName ?? s.organizationId ?? '')}</span>
					{#if s.catalogNumber}<code>{String(s.catalogNumber)}</code>{/if}
					{#if s.orderUrl}<a
							class="underline"
							href={String(s.orderUrl)}
							target="_blank"
							rel="noopener">{tr('org_order')}</a
						>{/if}
					{#if s.orderEmail}<a class="underline" href={`mailto:${s.orderEmail}`}
							>{String(s.orderEmail)}</a
						>{/if}
					{#if s.verified}<Badge tone="ok">{tr('org_verified')}</Badge>{:else}<Badge tone="warn"
							>{tr('org_unverified')}</Badge
						>{/if}
					{#if session.signedIn && s.id}<Button
							size="xs"
							variant="ghost"
							onclick={() => removeSupplier(String(s.id))}>{tr('common_delete')}</Button
						>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</Section>

<Dialog bind:open={showSupplier} title={tr('supplier_add')}>
	<p class="mb-2 text-xs text-muted-foreground">{tr('supplier_hint_leader')}</p>
	<div class="space-y-2 text-sm">
		<label class="block">
			<span class="text-xs text-muted-foreground">{tr('supplier_org_label')} *</span>
			{#if orgsLoading}
				<p class="mt-0.5 text-xs text-muted-foreground">{tr('supplier_org_loading')}</p>
			{:else if orgsFailed}
				<p class="mt-0.5 text-xs text-destructive">{tr('supplier_org_failed')}</p>
			{:else if orgOptions.length === 0}
				<p class="mt-0.5 text-xs text-muted-foreground">{tr('supplier_org_none')}</p>
			{:else}
				<Select
					name="sup_organizationId"
					class="mt-0.5"
					bind:value={orgId}
					options={orgOptions}
					placeholder={tr('supplier_org_choose')}
				/>
			{/if}
		</label>
		{#each ['catalogNumber', 'orderUrl', 'orderEmail', 'notes', 'description'] as k (k)}
			<label class="block">
				<span class="text-xs text-muted-foreground">{fieldLabel(k)}</span>
				<Input name={`sup_${k}`} class="mt-0.5 h-8 w-full" bind:value={supForm[k]} />
			</label>
		{/each}
		<div class="flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (showSupplier = false)}>{tr('common_cancel')}</Button>
			<Button onclick={addSupplier} disabled={orgsLoading || !orgId}>{tr('common_save')}</Button>
		</div>
	</div>
</Dialog>
