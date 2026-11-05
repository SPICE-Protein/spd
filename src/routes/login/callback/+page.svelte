<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { session } from '$lib/state/session.svelte';
	import { tr } from '$lib/i18n';
	import { toastOk } from '$lib/state/toast.svelte';
	import Button from '$lib/components/Button.svelte';

	// ORCID 303-redirects here (backend ORCID_FRONTEND_REDIRECT_URI) with the
	// spd_session cookie already set. Resolve the session, then move on.
	let state = $state<'working' | 'ok' | 'failed'>('working');

	onMount(async () => {
		try {
			await session.refresh();
			if (session.signedIn) {
				state = 'ok';
				toastOk(tr('login_success', { name: session.user?.displayName ?? '' }));
				// Handoff back to a page the user started from would need a stored
				// target; keep it simple and honest — the cookie is the payload.
				setTimeout(() => goto('/', { replaceState: true }), 400);
			} else {
				state = 'failed';
			}
		} catch {
			state = 'failed';
		}
	});
</script>

<div class="mx-auto max-w-md py-16 text-center">
	{#if state === 'working'}
		<p class="text-sm text-muted-foreground">{tr('login_working')}</p>
	{:else if state === 'ok'}
		<h1 class="text-xl font-bold">{tr('login_success_title')}</h1>
		<p class="mt-2 text-sm text-muted-foreground">{tr('login_success_hint')}</p>
	{:else}
		<h1 class="text-xl font-bold">{tr('login_failed_title')}</h1>
		<p class="mt-2 text-sm text-muted-foreground">{tr('login_failed_hint')}</p>
		<div class="mt-4 flex justify-center gap-2">
			<Button size="sm" onclick={() => session.signIn()}>{tr('login_retry')}</Button>
			<Button size="sm" variant="ghost" href="/">{tr('nav_home')}</Button>
		</div>
	{/if}
</div>

<svelte:head><title>{tr('nav_login')} · SPD</title></svelte:head>
