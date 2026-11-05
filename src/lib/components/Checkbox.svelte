<script lang="ts">
	// shadcn Checkbox wrapper — boolean bind plus an optional onchange, which
	// the JS-driven forms (that mirror state into strings) rely on.
	import { Checkbox as ShadcnCheckbox } from '$lib/components/ui/checkbox';

	let {
		name,
		checked = $bindable(false),
		disabled = false,
		class: klass = '',
		onchange = undefined
	}: {
		name: string;
		checked?: boolean;
		disabled?: boolean;
		class?: string;
		onchange?: (checked: boolean) => void;
	} = $props();
</script>

<ShadcnCheckbox
	{name}
	bind:checked
	{disabled}
	class={klass}
	onCheckedChange={(v) => {
		checked = v === true;
		onchange?.(checked);
	}}
/>
