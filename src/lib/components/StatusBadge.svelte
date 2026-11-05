<script lang="ts">
	import Badge from './Badge.svelte';
	import { enumLabel } from '$lib/i18n';

	let {
		status,
		ns = 'st'
	}: {
		status: string | null | undefined;
		/** message namespace for the value (st_, vs_, ast_, pub_ …) */
		ns?: string;
	} = $props();

	const TONES: Record<string, string> = {
		// generic lifecycle
		active: 'ok',
		pending: 'warn',
		pending_screening: 'warn',
		screened: 'ok',
		needs_revision: 'warn',
		rejected_with_reason: 'bad',
		rejected: 'bad',
		// a filed correction that actually landed on its target (§53)
		applied: 'ok',
		invalidate: 'bad',
		published: 'ok',
		invalidated: 'bad',
		recused: 'muted',
		archived: 'muted',
		draft: 'muted',
		declined: 'bad',
		declined_for_this_round: 'bad',
		// editorial decisions (0032): the four OJS verdicts
		accept: 'ok',
		minor_revision: 'warn',
		major_revision: 'warn',
		// assessment vocabulary
		computational_only: 'muted',
		experimentally_supported: 'ok',
		experimentally_contradicted: 'bad',
		partially_supported: 'warn',
		community_validated: 'ok',
		inconclusive: 'warn',
		superseded: 'muted',
		retracted: 'bad',
		// validation status derived on folds
		tested: 'info',
		not_tested: 'muted',
		validated: 'ok',
		contradicted: 'bad',
		mixed: 'warn',
		// trust tiers
		unverified: 'muted',
		verified: 'ok',
		// org/claim/application
		approved: 'ok',
		under_review: 'info',
		awaiting_email: 'warn',
		email_received: 'info',
		expired: 'muted',
		revoked: 'bad',
		suspended: 'bad',
		completed: 'ok',
		// editorial tasks
		open: 'info',
		in_progress: 'warn',
		resolved: 'ok',
		cancelled: 'muted',
		accepted: 'ok',
		removed: 'muted'
	};

	const tone = $derived(status ? (TONES[status] ?? 'neutral') : 'neutral');
</script>

<Badge {tone}>{status ? enumLabel(ns, status) : '—'}</Badge>
