<script lang="ts">
	/**
	 * The front door of BioBrick lazy loading: a part SPD does not hold is
	 * imported from the iGEM Registry the first time someone asks for its
	 * number, then served from D1 like any other record.
	 */
	import { goto } from '$app/navigation';
	import { biobricks } from '$lib/api/client';
	import { tr } from '$lib/i18n';
	import { session } from '$lib/state/session.svelte';
	import Button from './Button.svelte';
	import { Input } from '$lib/components/ui/input';

	let name = $state('');
	let busy = $state(false);
	let error = $state('');

	const valid = $derived(/^BBa_[A-Za-z0-9_]{1,55}$/.test(name.trim()));

	async function run() {
		if (!valid || busy) return;
		busy = true;
		error = '';
		try {
			const part = await biobricks.resolve(name.trim());
			await goto(`/biobricks/${part.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

{#if session.canWrite}
	<form
		class="mb-4 flex flex-wrap items-center gap-2 border border-border bg-muted/30 p-3"
		onsubmit={(e) => {
			e.preventDefault();
			void run();
		}}
	>
		<span class="text-sm">{tr('biobrick_registry_lookup')}</span>
		<Input
			name="biobrick_part_number"
			class="h-9 w-56 font-mono"
			placeholder="BBa_E0040"
			aria-label={tr('biobrick_registry_lookup')}
			bind:value={name}
		/>
		<Button type="submit" size="sm" disabled={!valid || busy}>
			{busy ? tr('common_loading') : tr('biobrick_import_registry')}
		</Button>
		{#if error}<span class="text-sm text-destructive">{error}</span>{/if}
	</form>
{/if}
