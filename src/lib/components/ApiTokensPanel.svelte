<script lang="ts">
	import { apiTokens } from '$lib/api/client';
	import type { ApiTokenRow } from '$lib/api/types';
	import { session } from '$lib/state/session.svelte';
	import { tr, enumLabel } from '$lib/i18n';
	import { fmtTime } from '$lib/format';
	import { toastOk, toastErr } from '$lib/state/toast.svelte';
	import Section from './Section.svelte';
	import Badge from './Badge.svelte';
	import Button from './Button.svelte';
	import Input from './Input.svelte';

	let rows = $state<ApiTokenRow[]>([]);
	let loading = $state(false);
	let minting = $state(false);
	let form = $state({ name: '', expiresInDays: '' });
	/** the raw secret exists only in the mint response — hold it until dismissed */
	let freshToken = $state('');

	async function load() {
		loading = true;
		try {
			const res = await apiTokens.list();
			rows = res.tokens ?? [];
		} catch (e) {
			toastErr(e);
		} finally {
			loading = false;
		}
	}
	$effect(() => {
		if (session.signedIn) void load();
	});

	async function mint() {
		if (!form.name.trim()) return;
		minting = true;
		try {
			const r = await apiTokens.mint({
				name: form.name.trim(),
				expiresInDays: form.expiresInDays ? Number(form.expiresInDays) : null
			});
			freshToken = r.token;
			form = { name: '', expiresInDays: '' };
			await load();
		} catch (e) {
			toastErr(e);
		} finally {
			minting = false;
		}
	}

	async function copyToken() {
		try {
			await navigator.clipboard.writeText(freshToken);
			toastOk(tr('token_copied'));
		} catch {
			toastErr(tr('upload_clipboard_fail'));
		}
	}

	// the tokenId is what revocation and admin tier ops address; showing it
	// in full (plus one-click copy) keeps users out of devtools
	async function copyId(id: string) {
		try {
			await navigator.clipboard.writeText(id);
			toastOk(tr('token_id_copied'));
		} catch {
			toastErr(tr('upload_clipboard_fail'));
		}
	}

	async function revoke(t: ApiTokenRow) {
		if (!confirm(tr('token_revoke_confirm'))) return;
		try {
			await apiTokens.revoke(String(t.tokenId));
			await load();
		} catch (e) {
			toastErr(e);
		}
	}
</script>

<Section title={tr('token_title')} hint={tr('token_intro')}>
	{#snippet actions()}
		{#if session.signedIn}<Button size="xs" variant="outline" onclick={() => load()} disabled={loading}>{tr('common_reload')}</Button>{/if}
	{/snippet}

	{#if freshToken}
		<div class="mb-3 rounded-none border-2 border-emerald-500/70 bg-emerald-50 dark:bg-emerald-500/10 p-3">
			<p class="text-sm font-semibold text-emerald-900 dark:text-emerald-200">{tr('token_minted_once')}</p>
			<div class="mt-2 flex items-center gap-2">
				<code class="flex-1 overflow-x-auto rounded-none bg-background px-2 py-1.5 font-mono text-xs">{freshToken}</code>
				<Button size="xs" onclick={copyToken}>{tr('token_copy')}</Button>
				<Button size="xs" variant="ghost" onclick={() => (freshToken = '')}>{tr('common_close')}</Button>
			</div>
		</div>
	{/if}

	{#if session.signedIn}
		<div class="mb-3 flex flex-wrap items-end gap-2">
			<label class="block text-sm">
				<span class="text-xs text-muted-foreground">{tr('f_name')}</span>
				<Input name="tok_name" class="mt-1 h-8 w-44 text-sm" maxlength={100} bind:value={form.name} />
			</label>
			<label class="block text-sm">
				<span class="text-xs text-muted-foreground">{tr('token_expires_days')} <span class="text-muted-foreground/70">{tr('optional_hint')}</span></span>
				<Input name="tok_days" type="number" class="mt-1 h-8 w-24 text-sm" bind:value={form.expiresInDays} />
			</label>
			<Button size="sm" onclick={mint} disabled={minting || !form.name.trim()}>{tr('token_mint')}</Button>
		</div>

		{#if rows.length === 0}
			<p class="text-sm text-muted-foreground">{loading ? tr('common_loading') : tr('token_empty')}</p>
		{:else}
			<ul class="divide-y text-sm">
				{#each rows as t (t.tokenId)}
					<li class="flex flex-wrap items-center gap-2 py-2">
						<span class="font-medium">{t.name}</span>
						<code class="font-mono text-xs text-muted-foreground">{t.prefix}…</code>
						<code class="break-all rounded-none bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">ID {t.tokenId}</code>
						<Button size="xs" variant="ghost" onclick={() => copyId(String(t.tokenId))}>{tr('token_copy_id')}</Button>
						<Badge tone={t.tier === 'unlimited' ? 'info' : 'muted'}>{enumLabel('tk', String(t.tier ?? 'standard'))}</Badge>
						{#if t.revoked}
							<Badge tone="bad">{tr('token_revoked')}{t.revokedAt ? ` · ${fmtTime(Number(t.revokedAt))}` : ''}</Badge>
						{:else if t.expiresAt}
							<span class="text-xs text-muted-foreground">{tr('token_expires_at')} {fmtTime(Number(t.expiresAt))}</span>
						{:else}
							<span class="text-xs text-muted-foreground">{tr('token_never_expires')}</span>
						{/if}
						<span class="ml-auto text-xs text-muted-foreground">
							{t.lastUsedAt ? `${tr('token_last_used')} ${fmtTime(Number(t.lastUsedAt))}` : tr('token_unused')}
						</span>
						{#if !t.revoked}<Button size="xs" variant="ghost" onclick={() => revoke(t)}>{tr('token_revoke')}</Button>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{:else}
		<div class="flex items-center justify-between">
			<p class="text-sm text-muted-foreground">{tr('token_login')}</p>
			<Button size="sm" onclick={() => session.signIn()}>{tr('nav_login')}</Button>
		</div>
	{/if}
</Section>
