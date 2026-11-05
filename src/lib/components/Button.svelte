<script lang="ts">
	// shadcn Button wrapper. Legacy prop names (primary/danger, md) translate
	// onto the library's variant/size vocabulary, so no page had to change
	// when the UI stack moved to shadcn.
	import { Button as ShadcnButton, type ButtonVariant, type ButtonSize } from '$lib/components/ui/button';

	type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'link';
	type Size = 'sm' | 'md' | 'xs';

	let {
		variant = 'primary',
		size = 'md',
		href = undefined,
		type = 'button',
		disabled = false,
		onclick = undefined,
		class: klass = '',
		aria_label = undefined,
		title = undefined,
		children
	}: {
		variant?: Variant;
		size?: Size;
		href?: string;
		type?: 'button' | 'submit';
		disabled?: boolean;
		onclick?: (e: MouseEvent) => void;
		class?: string;
		aria_label?: string;
		title?: string;
		children: import('svelte').Snippet;
	} = $props();

	const VARIANTS: Record<Variant, ButtonVariant> = {
		primary: 'default',
		secondary: 'secondary',
		ghost: 'ghost',
		outline: 'outline',
		danger: 'destructive',
		link: 'link'
	};
	const SIZES: Record<Size, ButtonSize> = { xs: 'xs', sm: 'sm', md: 'default' };
</script>

<ShadcnButton variant={VARIANTS[variant]} size={SIZES[size]} {href} {type} {disabled} {onclick} class={klass} aria-label={aria_label} {title} data-print-hide data-sveltekit-preload-data="tap">
	{@render children()}
</ShadcnButton>
