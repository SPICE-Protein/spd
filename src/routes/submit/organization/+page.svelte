<script lang="ts">
	import { organizations } from '$lib/api/client';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { toastOk } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import Button from '$lib/components/Button.svelte';
	import FormFields from '$lib/components/FormFields.svelte';
	import type { FormField } from '$lib/components/form';
	import { buildSafe } from '$lib/components/form-values';

	const FIELDS: FormField[] = [
		{ name: 'name', required: true },
		{ name: 'department' },
		{ name: 'domain', hint: tr('org_hint_domain') },
		{ name: 'verificationEmail' },
		{ name: 'evidenceEmail' },
		{ name: 'evidenceSummary', kind: 'textarea', required: true, rows: 4, hint: tr('org_hint_evidence') }
	];

	let values = $state<Record<string, string>>({});
	let error = $state('');
	let saving = $state(false);
	let result = $state('');

	async function submit() {
		error = '';
		result = '';
		const b = buildSafe(values, FIELDS);
		if (b.error || !b.body) return (error = b.error ?? tr('form_required_missing'));
		if (!b.body.name || !b.body.evidenceSummary) return (error = tr('form_required_missing'));
		saving = true;
		try {
			const r = await organizations.createClaim(b.body as never);
			result = String(r.verificationId ?? JSON.stringify(r));
			toastOk(tr('org_claim_submitted'));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}
</script>

<div class="mx-auto max-w-2xl space-y-4">
	<h1 class="flex items-center gap-1.5 text-2xl font-bold">
		{tr('submit_organization')}
		<InfoTip
			text={tr('org_claim_intro')}
			label={`${tr('submit_organization')} — ${tr('common_more_info')}`}
			class="mt-1"
		/>
	</h1>
	<Section>
		{#if !session.signedIn}
			<div class="flex items-center gap-3 text-sm">
				{tr('submit_login_needed')} <Button size="sm" onclick={() => session.signIn()}>{tr('nav_login')}</Button>
			</div>
		{:else}
			<p class="mb-3 text-xs text-muted-foreground">
				<a class="underline" href="/organizations">{tr('org_dir_link')}</a>
			</p>
			{#if error}<p class="mb-2 rounded-none bg-destructive/10 p-2 text-xs text-destructive">{error}</p>{/if}
			{#if result}
				<p class="rounded-none bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-900 dark:text-emerald-200">
					{tr('org_claim_submitted')} · verification id <code class="font-mono break-all">{result}</code>
				</p>
				<div class="mt-2 flex items-center gap-1">
					<Button size="sm" variant="outline" href="/organizations">→ {tr('nav_organizations')}</Button>
					<InfoTip
						text={tr('org_claim_next_hint')}
						label={tr('common_more_info')}
					/>
				</div>
			{:else}
				<FormFields fields={FIELDS} bind:values />
				<div class="mt-3 flex justify-end"><Button onclick={submit} disabled={saving}>{tr('common_submit')}</Button></div>
			{/if}
		{/if}
	</Section>
</div>

<svelte:head><title>{tr('submit_organization')} · SPD</title></svelte:head>
