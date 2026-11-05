<script lang="ts">
	import { page } from '$app/state';
	import EntityDetail from '$lib/components/EntityDetail.svelte';
	import type { EntityDetailConfig } from '$lib/components/EntityDetail.svelte';
	import { constructs } from '$lib/api/client';
	import { tr } from '$lib/i18n';

	const id = $derived(page.params.id ?? '');

	// The record is an api_record: its meaning (the two design inputs and the
	// assembly verdict) lives under `payload`, while EntityDetail reads flat
	// fields. Lift the payload before handing the row over.
	async function getConstruct(i: string) {
		const row = (await constructs.get(i)) as Record<string, unknown>;
		const payload = (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>;
		const validation = (payload.validation && typeof payload.validation === 'object' ? payload.validation : {}) as Record<string, unknown>;
		return {
			...row,
			...payload,
			vectorTemplateId: payload.vectorId ?? payload.vectorTemplateId,
			expressionCassetteId: payload.cassetteId ?? payload.expressionCassetteId,
			validationStatus:
				validation.implemented === false
					? 'not_implemented'
					: validation.valid === true
						? 'valid'
						: validation.valid === false
							? 'invalid'
							: null
		};
	}

	const config = $derived.by((): EntityDetailConfig => ({
		title: tr('browse_constructs'),
		id,
		get: getConstruct,
		scalarKeys: ['id', 'vectorTemplateId', 'expressionCassetteId', 'validationStatus', 'createdAt', 'assembledSequenceSha256'],
		route: 'constructs',
		entityType: 'construct',
	}));
</script>

<EntityDetail {config} />
