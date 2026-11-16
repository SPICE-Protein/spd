<script lang="ts">
	import { useNodesInitialized, useSvelteFlow } from '@xyflow/svelte';

	// Keep the whole walk in view as it grows. The layout itself never moves a
	// node after it is placed, so the only motion an expansion causes is the
	// camera zooming out far enough to include the new branch — which beats
	// adding records somewhere the reader cannot see.
	let { signature }: { signature: string } = $props();

	const flow = useSvelteFlow();
	// Svelte Flow measures each node after rendering it. A fit issued before
	// that measures nothing, so the fit is the one thing here that has to wait
	// for the library to say it is ready.
	const ready = useNodesInitialized();
	// Deliberately not `$state`: this is a memo of what was last framed, and
	// making it reactive would make the effect retrigger on its own write.
	let last = '';

	$effect(() => {
		if (signature === last || !ready.current) return;
		last = signature;
		// One frame later still: the fit runs against the transform Svelte Flow
		// is about to apply, so it belongs after that frame rather than inside
		// the same effect pass.
		const frame = requestAnimationFrame(() => {
			void flow.fitView({ padding: 0.3, maxZoom: 1, duration: 220 });
		});
		return () => cancelAnimationFrame(frame);
	});
</script>
