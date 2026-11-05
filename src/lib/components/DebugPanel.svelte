<script lang="ts">
	import { errorLog } from '$lib/state/errors.svelte';
	import { tr } from '$lib/i18n';
	import Button from '$lib/components/Button.svelte';
	import { fmtTime } from '$lib/format';
	import { cn } from '$lib/utils';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	// Floating error ledger. Only rendered when something was captured, so a
	// healthy session never sees it. Expand to read the route + stack.
	let open = $state(false);
	let dismissed = $state(false);

	onMount(() => errorLog.install());

	async function copyAll() {
		const text = errorLog.entries
			.map((e) => `[${fmtTime(e.at, true)}] ${e.source} ${e.route}\n${e.message}\n${e.stack}`)
			.join('\n\n———\n\n');
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			/* clipboard denied; the on-screen text is still selectable */
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (open = false)} />

{#if browser && !dismissed && errorLog.entries.length}
	<div class="fixed bottom-3 right-3 z-[90] max-w-[min(92vw,44rem)]">
		<div class={cn('rounded-none border-2 bg-background shadow-lg', open ? 'border-amber-500' : 'border-red-500/70')}>
			<Button variant="ghost" size="sm" class="h-auto w-full justify-between rounded-none px-3 py-1.5 text-xs font-semibold" onclick={() => (open = !open)}>
				<span class="flex size-4 items-center justify-center rounded-none bg-red-500 text-[10px] text-white">{errorLog.entries.length}</span>
				{tr('debug_title')}
				<span class="ml-auto text-muted-foreground">{open ? tr('common_close') : tr('debug_expand')}</span>
			</Button>
			{#if open}
				<div class="max-h-[50vh] space-y-2 overflow-y-auto border-t px-3 py-2">
					{#each errorLog.entries as e (e.id)}
						<div class="rounded-none border bg-muted/30 p-2 text-[11px] leading-relaxed">
							<p class="font-semibold">{e.message}</p>
							<p class="text-muted-foreground">
								{fmtTime(e.at, true)} · {e.source} · <code class="font-mono break-all">{e.route}</code>
							</p>
							{#if e.stack}
								<pre class="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-[10px] text-muted-foreground">{e.stack}</pre>
							{/if}
						</div>
					{/each}
				</div>
				<div class="flex justify-end gap-1 border-t px-2 py-1.5">
					<Button size="xs" variant="ghost" onclick={() => void copyAll()}>{tr('debug_copy')}</Button>
					<Button size="xs" variant="ghost" onclick={() => errorLog.clear()}>{tr('debug_clear')}</Button>
					<Button size="xs" variant="ghost" class="text-muted-foreground" onclick={() => (dismissed = true)}>{tr('debug_dismiss')}</Button>
				</div>
			{/if}
		</div>
	</div>
{/if}
