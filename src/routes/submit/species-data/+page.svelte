<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { enzymes } from '$lib/api/client';
	import type { SearchHit } from '$lib/api/types';
	import { tr } from '$lib/i18n';
	import { session } from '$lib/state/session.svelte';
	import { toastErr, toastOk } from '$lib/state/toast.svelte';
	import Section from '$lib/components/Section.svelte';
	import Button from '$lib/components/Button.svelte';
	import Field from '$lib/components/Field.svelte';
	import Input from '$lib/components/Input.svelte';
	import Textarea from '$lib/components/Textarea.svelte';
	import TargetPicker from '$lib/components/TargetPicker.svelte';
	import UploadPicker from '$lib/components/UploadPicker.svelte';

	// A deep link from the enzyme page arrives already-picked; the picker still
	// owns the choice and can change it.
	const seeded = String(page.url.searchParams.get('enzymeId') ?? '').trim();
	let enzymeId = $state(seeded);
	let organism = $state('');
	let citation = $state('');
	let artifactIds = $state('');
	let busy = $state(false);
	let error = $state('');

	// The keys are the canonical English labels the species panel already
	// understands, so a community row and a BRENDA row render through the same
	// grouping/labels. Units stay inside the value, as researchers write them.
	const FIELDS = [
		{ key: 'Substrate', message: 'species_field_substrate' },
		{ key: 'Product', message: 'species_field_product' },
		{ key: 'KM value', message: 'species_field_km' },
		{ key: 'kcat', message: 'species_field_kcat' },
		{ key: 'Ki value', message: 'species_field_ki' },
		{ key: 'IC50 value', message: 'species_field_ic50' },
		{ key: 'pH optimum', message: 'species_field_ph' },
		{ key: 'Temperature optimum', message: 'species_field_temperature' },
		{ key: 'Cofactors', message: 'species_field_cofactors' },
		{ key: 'Inhibitors', message: 'species_field_inhibitors' },
		{ key: 'Specific activity', message: 'species_field_activity' },
		{ key: 'Commentary', message: 'species_field_commentary' }
	] as const;

	// Every bound input needs a string at mount: `bind:value={undefined}`
	// against a prop with a fallback is a hard Svelte error.
	let values = $state<Record<string, string>>(
		Object.fromEntries(FIELDS.map((field) => [field.key, '']))
	);

	function pick(hit: SearchHit | null) {
		enzymeId = hit?.id ?? '';
	}

	async function submit() {
		error = '';
		if (!enzymeId) {
			error = tr('species_data_need_enzyme');
			return;
		}
		if (!organism.trim()) {
			error = tr('species_data_need_organism');
			return;
		}
		const fields: Record<string, string[]> = {};
		for (const field of FIELDS) {
			const value = (values[field.key] ?? '').trim();
			if (value) fields[field.key] = [value];
		}
		if (!Object.keys(fields).length) {
			error = tr('species_data_need_field');
			return;
		}
		busy = true;
		try {
			await enzymes.submitSpeciesData(enzymeId, {
				organism: organism.trim(),
				fields,
				citation: citation.trim() || undefined,
				artifactIds: artifactIds
					.split(',')
					.map((id) => id.trim())
					.filter(Boolean)
			});
			toastOk(tr('species_data_submitted'));
			await goto(`/enzymes/${enzymeId}`);
		} catch (e) {
			toastErr(e);
		} finally {
			busy = false;
		}
	}
</script>

<div class="mx-auto max-w-3xl space-y-4">
	<div>
		<h1 class="text-2xl font-bold">{tr('submit_species_data')}</h1>
		<p class="mt-1 text-sm text-muted-foreground">{tr('submit_species_data_intro')}</p>
	</div>

	{#if session.signedIn}
		<Section title={tr('species_data_step_enzyme')}>
			<TargetPicker
				entityType="enzyme"
				initial={enzymeId ? { id: enzymeId } : undefined}
				onpick={pick}
			/>
			<p class="mt-2 text-xs text-muted-foreground">{tr('species_data_enzyme_hint')}</p>
		</Section>

		<Section title={tr('species_data_step_values')}>
			<div class="space-y-3">
				<Field name="species_organism" label={tr('species_data_organism')} required>
					<Input
						name="species_organism"
						bind:value={organism}
						placeholder={tr('species_data_organism_placeholder')}
					/>
				</Field>

				<div class="grid gap-3 sm:grid-cols-2">
					{#each FIELDS as field, i (field.key)}
						<Field name={`species_field_${i}`} label={tr(field.message)}>
							{#if field.key === 'Commentary'}
								<Textarea name={`species_field_${i}`} rows={3} bind:value={values[field.key]} />
							{:else}
								<Input name={`species_field_${i}`} bind:value={values[field.key]} />
							{/if}
						</Field>
					{/each}
				</div>

				<Field
					name="species_citation"
					label={tr('species_data_citation')}
					hint={tr('species_data_citation_hint')}
				>
					<Textarea name="species_citation" rows={2} bind:value={citation} />
				</Field>

				<Field
					name="species_artifacts"
					label={tr('supplementary_materials')}
					hint={tr('supplementary_zip_hint')}
				>
					<UploadPicker
						bind:value={artifactIds}
						multiple
						kinds={['supplementary_zip']}
						defaultKind="supplementary_zip"
					/>
				</Field>

				<p class="text-xs text-muted-foreground">{tr('species_data_units_hint')}</p>
				{#if error}
					<p class="text-sm text-destructive">{error}</p>
				{/if}
				<div class="flex items-center gap-2">
					<Button onclick={submit} disabled={busy}>
						{busy ? tr('species_data_submitting') : tr('species_data_submit')}
					</Button>
					{#if enzymeId}
						<a class="text-sm underline" href={`/enzymes/${enzymeId}`}>{tr('common_view')}</a>
					{/if}
				</div>
			</div>
		</Section>
	{:else}
		<div
			class="flex items-center gap-3 rounded-none border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200"
		>
			{tr('submit_login_needed')}
			<Button size="sm" onclick={() => session.signIn()}>{tr('nav_login')}</Button>
		</div>
	{/if}

	<p class="text-xs text-muted-foreground">{tr('species_data_attribution_note')}</p>
</div>

<svelte:head><title>{tr('submit_species_data')} · SPD</title></svelte:head>
