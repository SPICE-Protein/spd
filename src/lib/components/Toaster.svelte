<script lang="ts">
	import { toasts } from '$lib/state/toast.svelte';
	import { cn } from '$lib/utils';
	import Button from './Button.svelte';

	const tones: Record<string, string> = {
		success: 'border-l-emerald-500',
		error: 'border-l-red-500',
		info: 'border-l-sky-500'
	};
</script>

<div class="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
	{#each toasts.items as t (t.id)}
		<div
			class={cn(
				'pointer-events-auto rounded-none border border-l-4 bg-background p-3 text-sm shadow-lg',
				tones[t.kind] ?? 'border-l-gray-400'
			)}
			role="status"
		>
			<div class="flex items-start justify-between gap-2">
				<span class="break-words">{t.message}</span>
				<Button size="xs" variant="ghost" class="shrink-0 text-muted-foreground" onclick={() => toasts.dismiss(t.id)} aria_label="dismiss">✕</Button>
			</div>
		</div>
	{/each}
</div>
