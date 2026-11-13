<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import BookmarkIcon from '@lucide/svelte/icons/bookmark';
	import SettingsIcon from '@lucide/svelte/icons/settings';
	import { tr } from '$lib/i18n';
	import { session } from '$lib/state/session.svelte';
	import { market } from '$lib/state/market.svelte';
	import { seasonal } from '$lib/state/seasonal.svelte';
	import Button from './Button.svelte';
	import Input from './Input.svelte';
	import SeasonalWordmark from './SeasonalWordmark.svelte';
	import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
	import { cn } from '$lib/utils';

	/**
	 * The bar shows what to DO, not every place to GO. Submit stays a
	 * first-class verb (it is the whole product); the reading destinations
	 * collapse into a 浏览 dropdown, and everything about the current person
	 * — workspace, admin, account, sign out — into the account dropdown.
	 * Nine naked links at peak roles became three controls; /browse itself
	 * stays in the dropdown as the full grouped catalog, so nothing that was
	 * one click away is now more than two.
	 */
	const browseLinks = [
		{ href: '/browse', key: 'browse_all' },
		{ href: '/market', key: 'nav_market' },
		{ href: '/proteins', key: 'nav_proteins' },
		{ href: '/folds/query', key: 'nav_folds' },
		{ href: '/reviews', key: 'nav_reviews' },
		{ href: '/help', key: 'nav_help' }
	];

	let term = $state('');
	// The market store hydrates from localStorage; wait until after hydration
	// before showing its count so SSR and the browser agree on the markup.
	let marketReady = $state(false);
	$effect(() => {
		marketReady = true;
	});

	// the /me entry matches its own pages only — '/me' is also the prefix of
	// /measurements, and lighting up the account menu there would be a lie
	const onPath = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	const onBrowse = $derived(browseLinks.some((l) => onPath(l.href)));
	const accountLinks = $derived([
		{ href: '/my', key: 'nav_my' },
		...(session.isCurator
			? [{ href: '/admin', key: session.isAdmin ? 'nav_admin' : 'nav_editorial' }]
			: []),
		{ href: '/me', key: 'nav_account' }
	]);
	const onAccount = $derived(session.signedIn && accountLinks.some((l) => onPath(l.href)));
	const searchPlaceholder = $derived(seasonal.season === 'pi-day' ? tr('season_pi_search_placeholder') : tr('nav_search_placeholder'));

	async function signOut() {
		await session.logout();
		goto('/');
	}
</script>

<header
	class="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
	data-print-hide
>
	<div class="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
		<a href="/" class="flex items-baseline gap-2 whitespace-nowrap">
			<span class="text-lg font-bold tracking-tight"><SeasonalWordmark /></span>
			<span class="hidden text-xs text-muted-foreground sm:inline">{tr('app_tagline')}</span>
		</a>

		<form
			class="ml-2 hidden min-w-0 flex-1 md:flex"
			onsubmit={(e) => {
				e.preventDefault();
				if (term.trim()) location.href = resolve(`/search?q=${encodeURIComponent(term.trim())}`);
			}}
		>
			<Input name="q" type="search" bind:value={term} placeholder={searchPlaceholder} class="h-8 w-full max-w-md" />
		</form>

		<nav class="ml-auto flex items-center gap-0.5 text-sm">
			<DropdownMenu>
				<DropdownMenuTrigger
					class={cn('flex items-center gap-1 whitespace-nowrap rounded-none px-2 py-1 hover:bg-accent', onBrowse && 'bg-accent font-medium')}
				>
					{tr('nav_browse')}
					<ChevronDownIcon class="size-3.5 shrink-0 text-muted-foreground" />
				</DropdownMenuTrigger>
				<DropdownMenuContent class="w-auto min-w-40">
					{#each browseLinks as l (l.href)}
						<DropdownMenuItem class={cn('text-sm', onPath(l.href) && 'font-medium')} onclick={() => void goto(l.href)}>
							{tr(l.key)}
							{#if marketReady && l.href === '/market' && market.items.length > 0}
								<span class="ml-auto rounded-none bg-muted px-1.5 text-[10px] tabular-nums">
									{market.items.length}
								</span>
							{/if}
						</DropdownMenuItem>
					{/each}
				</DropdownMenuContent>
			</DropdownMenu>

			{#if session.canWrite}
				<a href="/submit" class={cn('whitespace-nowrap rounded-none px-2 py-1 hover:bg-accent', page.url.pathname.startsWith('/submit') && 'bg-accent font-medium')}>{tr('nav_submit')}</a>
			{/if}

			{#if session.signedIn}
				<DropdownMenu>
					<DropdownMenuTrigger
						class={cn('flex max-w-44 items-center gap-1 whitespace-nowrap rounded-none px-2 py-1 hover:bg-accent', onAccount && 'bg-accent font-medium')}
					>
						<span class="truncate">{session.user?.displayName ?? session.user?.orcidId ?? tr('nav_account')}</span>
						<ChevronDownIcon class="size-3.5 shrink-0 text-muted-foreground" />
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" class="w-auto min-w-44">
						{#each accountLinks as l (l.href)}
							<DropdownMenuItem class={cn('text-sm', onPath(l.href) && 'font-medium')} onclick={() => void goto(l.href)}>
								{tr(l.key)}
							</DropdownMenuItem>
						{/each}
						<DropdownMenuSeparator />
						<DropdownMenuItem class="text-sm" variant="destructive" onclick={signOut}>{tr('nav_logout')}</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			{:else}
				<Button size="sm" variant="outline" onclick={() => session.signIn()}>
					<span class="sm:hidden">{tr('nav_login_short')}</span>
					<span class="hidden sm:inline">{tr('nav_login')}</span>
				</Button>
			{/if}
			<a
				href="/market"
				class={cn('flex items-center gap-1 whitespace-nowrap rounded-none px-2 py-1 hover:bg-accent', page.url.pathname.startsWith('/market') && 'bg-accent font-medium')}
				title={tr('nav_market')}
				aria-label={tr('nav_market')}
			>
				<BookmarkIcon class="size-4 text-muted-foreground" />
				{#if marketReady && market.items.length > 0}
					<span class="rounded-none bg-muted px-1.5 text-[10px] tabular-nums">{market.items.length}</span>
				{/if}
			</a>
			<a
				href="/settings"
				class={cn('whitespace-nowrap rounded-none px-2 py-1 hover:bg-accent max-[360px]:hidden', page.url.pathname.startsWith('/settings') && 'bg-accent font-medium')}
				title={tr('nav_settings')}
				aria-label={tr('nav_settings')}
			>
				<SettingsIcon class="size-4 text-muted-foreground" />
			</a>
		</nav>
	</div>
</header>
