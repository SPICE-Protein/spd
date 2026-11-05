<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import { cn } from '$lib/utils';

	let { source = '', class: klass = '' }: { source?: string; class?: string } = $props();

	const html = $derived(
		source
			? DOMPurify.sanitize(marked.parse(source, { async: false, gfm: true, breaks: false }) as string)
			: ''
	);
</script>

<div class={cn('md text-sm leading-relaxed', klass)}>
	{@html html}
</div>

<style>
	/* plain CSS (not @apply) — keeps the renderer independent of tailwind's class scanning */
	.md :global(h1) {
		font-size: 1.125rem;
	}
	.md :global(h2) {
		font-size: 1rem;
	}
	.md :global(h1),
	.md :global(h2),
	.md :global(h3) {
		font-weight: 600;
		margin: 1rem 0 0.5rem;
	}
	.md :global(p) {
		margin: 0.5rem 0;
	}
	.md :global(ul),
	.md :global(ol) {
		margin: 0.5rem 0;
		padding-left: 1.5rem;
	}
	.md :global(ul) {
		list-style: disc;
	}
	.md :global(ol) {
		list-style: decimal;
	}
	.md :global(code) {
		background: var(--color-muted, #f1f5f9);
		border-radius: 0;
		padding: 0.05rem 0.3rem;
		font-family: ui-monospace, monospace;
		font-size: 0.8em;
	}
	.md :global(pre) {
		background: var(--color-muted, #f1f5f9);
		border-radius: 0;
		padding: 0.75rem;
		margin: 0.5rem 0;
		overflow: auto;
	}
	.md :global(pre code) {
		background: transparent;
		padding: 0;
	}
	.md :global(a) {
		color: var(--color-primary, #0f172a);
		text-decoration: underline;
	}
	.md :global(table) {
		border-collapse: collapse;
		margin: 0.5rem 0;
	}
	.md :global(th),
	.md :global(td) {
		border: 1px solid var(--color-border, #e2e8f0);
		padding: 0.25rem 0.5rem;
		text-align: left;
	}
	.md :global(blockquote) {
		border-left: 2px solid var(--color-border, #e2e8f0);
		padding-left: 0.75rem;
		margin: 0.5rem 0;
		color: var(--color-muted-foreground, #64748b);
	}
</style>
