<script lang="ts">
	import {
		Root as Breadcrumb,
		Item,
		Link,
		List,
		Page,
		Separator
	} from '$lib/components/ui/breadcrumb';
	import { tr } from '$lib/i18n';

	let {
		listHref,
		listLabel,
		current
	}: {
		listHref: string;
		listLabel: string;
		current: string;
	} = $props();
</script>

<Breadcrumb class="mb-1">
	<List>
		<Item><Link href="/">{tr('nav_home')}</Link></Item>
		<Separator />
		<Item><Link href={listHref}>{listLabel}</Link></Item>
		<Separator />
		<Item><Page class="break-all">{current}</Page></Item>
	</List>
</Breadcrumb>
