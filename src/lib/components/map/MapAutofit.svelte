<script lang="ts">
	import { useSvelteFlow } from '@xyflow/svelte';

	// Keep the whole walk in view as it grows. The layout itself never moves a
	// node after it is placed, so the only motion an expansion causes is the
	// camera zooming out far enough to include the new branch — which beats
	// adding records somewhere the reader cannot see.
	let { signature }: { signature: string } = $props();

	const flow = useSvelteFlow();
	// Deliberately not `$state`: this is a memo of what was last framed, and
	// making it reactive would make the effect retrigger on its own write.
	let last = '';

	$effect(() => {
		if (signature === last) return;
		const first = last === '';
		last = signature;
		// The initial fit is SvelteFlow's own (`fitView`), so only follow-ups
		// need this; skipping the first avoids fighting it during mount.
		if (!first) void flow.fitView({ padding: 0.25, maxZoom: 1, duration: 220 });
	});
</script>
