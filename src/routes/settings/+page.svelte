<script lang="ts">
	import { tr } from '$lib/i18n';
	import { session } from '$lib/state/session.svelte';
	import { theme, type ThemeChoice } from '$lib/state/theme.svelte';
	import { display } from '$lib/state/display.svelte';
	import { getLocale, setLocale } from '$lib/paraglide/runtime';
	import Section from '$lib/components/Section.svelte';
	import InfoTip from '$lib/components/InfoTip.svelte';
	import Button from '$lib/components/Button.svelte';
	import Checkbox from '$lib/components/Checkbox.svelte';

	// Everything here lives in localStorage: a preference belongs to the
	// browser, not the account — signing in on a lab machine must neither
	// inherit nor leak the previous person's theme. The server never sees
	// any of it, which is also why there is no save button.
	const THEMES: Array<{ value: ThemeChoice; key: string }> = [
		{ value: 'light', key: 'theme_light' },
		{ value: 'dark', key: 'theme_dark' },
		{ value: 'system', key: 'theme_system' }
	];

	let locale = $state(getLocale());
	// 'system' answers with whichever mode it currently resolves to
	const effective = $derived(theme.effective === 'dark' ? tr('theme_dark') : tr('theme_light'));

	function pickLocale(next: 'zh' | 'en') {
		locale = next;
		setLocale(next);
	}
</script>

<div class="mx-auto max-w-3xl space-y-4">
	<h1 class="text-2xl font-bold">{tr('settings_title')}</h1>
	<p class="text-sm text-muted-foreground">{tr('settings_intro')}</p>

	<Section title={tr('settings_appearance')}>
		<div class="flex flex-wrap items-center gap-2">
			{#each THEMES as t (t.value)}
				<Button size="sm" variant={theme.choice === t.value ? 'primary' : 'outline'} onclick={() => theme.set(t.value)}>{tr(t.key)}</Button>
			{/each}
			<span class="text-xs text-muted-foreground">{tr('settings_theme_now', { mode: effective })}</span>
		</div>
		<label class="mt-4 flex items-center gap-2 text-sm">
			<Checkbox name="full_ids" checked={display.fullIds} onchange={(c) => display.setFullIds(c)} />
			{tr('settings_full_ids')}
			<InfoTip
				text={tr('settings_full_ids_hint')}
				label={`${tr('settings_full_ids')} — ${tr('common_more_info')}`}
			/>
		</label>
	</Section>

	<Section title={tr('settings_language')}>
		<div class="flex gap-2">
			<Button size="sm" variant={locale === 'zh' ? 'primary' : 'outline'} onclick={() => pickLocale('zh')}>中文</Button>
			<Button size="sm" variant={locale === 'en' ? 'primary' : 'outline'} onclick={() => pickLocale('en')}>English</Button>
		</div>
	</Section>

	<Section title={tr('settings_account')}>
		{#if session.signedIn}
			<div class="flex flex-wrap gap-2">
				<Button size="sm" variant="outline" href="/my">{tr('nav_my')}</Button>
				<Button size="sm" variant="outline" href="/me">{tr('nav_account')}</Button>
				{#if session.isAdmin}
					<Button size="sm" variant="outline" href="/admin">{tr('nav_admin')}</Button>
				{/if}
			</div>
		{:else}
			<Button size="sm" onclick={() => session.signIn()}>{tr('nav_login')}</Button>
		{/if}
	</Section>

	<Section title={tr('settings_license')} hint={tr('settings_license_hint')}>
		<div>
			<Button size="sm" variant="outline" href="/license">{tr('settings_license_open')}</Button>
		</div>
	</Section>
</div>

<svelte:head><title>{tr('settings_title')} · SPD</title></svelte:head>
