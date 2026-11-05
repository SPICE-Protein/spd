<script lang="ts">
	import { tr, enumLabel } from '$lib/i18n';
	import type { PrintExtraSection } from '$lib/print/registry';
	import {
		asRecord,
		asRows,
		columnKeys,
		displayValue,
		isRecord,
		labelForKey,
		recordParts,
		visibleEntries
	} from '$lib/print/format';

	interface Props {
		title: string;
		category: string;
		publicId: string;
		sourceHref: string;
		record: Record<string, unknown>;
		extras?: PrintExtraSection[];
		wiki?: Record<string, unknown> | null;
		references?: Record<string, unknown>[];
		identifiers?: Record<string, unknown>[];
		relations?: Record<string, unknown>[];
		importProvenance?: Record<string, unknown> | null;
		generatedAt: string;
	}

	let {
		title,
		category,
		publicId,
		sourceHref,
		record,
		extras = [],
		wiki = null,
		references = [],
		identifiers = [],
		relations = [],
		importProvenance = null,
		generatedAt
	}: Props = $props();

	const parts = $derived(recordParts(record));
	const sourceUrl = $derived(
		typeof window !== 'undefined' ? new URL(sourceHref, window.location.origin).href : sourceHref
	);

	const identifierRows = $derived(
		identifiers.map((row) => ({
			source: enumLabel('extid_source', String(row.source ?? '').replace(/-/g, '_')),
			externalId: String(row.externalId ?? ''),
			url: typeof row.url === 'string' ? row.url : '',
			primary: row.primary === true
		}))
	);

	const relationRows = $derived(
		relations.map((row) => {
			const from = asRecord(row.from);
			const to = asRecord(row.to);
			const other =
				row.direction === 'out'
					? to
					: row.direction === 'in'
						? from
						: from?.id === publicId
							? to
							: from;
			const rawSource = String(row.source ?? '');
			const source =
				rawSource === 'derived'
					? tr('relations_source_derived')
					: rawSource.startsWith('spd')
						? ''
						: rawSource;
			return {
				relation: enumLabel('relation', String(row.relationType ?? '')),
				direction: row.direction === 'out' ? tr('relations_outgoing') : tr('relations_incoming'),
				entity: other
					? `${enumLabel('et', String(other.type ?? '').replace(/-/g, '_'))} · ${String(other.id ?? '')}`
					: '—',
				source,
				note: String(row.note ?? '')
			};
		})
	);

	const referenceRows = $derived(
		references.map((row) => ({
			source: String(row.source ?? ''),
			externalId: String(row.externalId ?? ''),
			title: String(row.title ?? ''),
			authors: Array.isArray(row.authors) ? row.authors.map(String).join(', ') : '',
			year: row.year == null ? '' : String(row.year),
			url: typeof row.oaUrl === 'string' ? row.oaUrl : ''
		}))
	);
</script>

{#snippet factTable(value: Record<string, unknown>)}
	<table class="print-facts">
		<tbody>
			{#each visibleEntries(value) as [key, item] (key)}
				<tr>
					<th>{labelForKey(key)}</th>
					<td>{displayValue(item, key)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

{#snippet dataTable(rows: Record<string, unknown>[], cols: string[])}
	<table class="print-table">
		<thead>
			<tr>
				{#each cols as col (col)}<th>{labelForKey(col)}</th>{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as row, i (i)}
				<tr>
					{#each cols as col (col)}<td>{displayValue(row[col], col)}</td>{/each}
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

{#snippet block(value: unknown, key: string)}
	{#if Array.isArray(value) && value.length > 0 && asRows(value).length === value.length}
		{@const rows = asRows(value)}
		{@const cols = columnKeys(rows)}
		{#if cols.length > 0 && cols.length <= 10}
			{@render dataTable(rows, cols)}
		{:else if cols.length > 10}
			{#each rows as row, i (i)}
				<div class="print-item">
					<h3>{labelForKey(key)} {i + 1}</h3>
					{@render factTable(row)}
				</div>
			{/each}
		{/if}
	{:else if Array.isArray(value)}
		<ul class="print-list">
			{#each value as item, i (i)}<li>{displayValue(item, key)}</li>{/each}
		</ul>
	{:else if isRecord(value)}
		{@render factTable(value)}
	{:else}
		<p>{displayValue(value, key)}</p>
	{/if}
{/snippet}

<div class="print-screen">
	<div class="print-toolbar">
		<a class="print-back" href={sourceHref}>← {tr('print_back')}</a>
		<button class="print-run" type="button" onclick={() => window.print()}>
			{tr('print_action')}
		</button>
	</div>

	<article class="print-doc">
		<header class="print-head">
			<p class="print-category">{category}</p>
			<h1 class="print-title">{title}</h1>
			<p class="print-id">{publicId}</p>
		</header>

		{#if parts.lead.length}
			<div class="print-lead">
				{#each parts.lead as field (field.key)}
					<p>{field.text}</p>
				{/each}
			</div>
		{/if}

		{#if parts.facts.length}
			<section class="print-section">
				<h2>{tr('common_details')}</h2>
				<table class="print-facts print-facts--lead">
					<tbody>
						{#each parts.facts as field (field.key)}
							<tr>
								<th>{labelForKey(field.key)}</th>
								<td>{displayValue(field.value, field.key)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/if}

		{#each parts.prose as field (field.key)}
			<section class="print-section">
				<h2>{labelForKey(field.key)}</h2>
				<p class="print-prose">{field.text}</p>
			</section>
		{/each}

		{#each parts.blocks as field (field.key)}
			<section class="print-section">
				<h2>{labelForKey(field.key)}</h2>
				{@render block(field.value, field.key)}
			</section>
		{/each}

		{#each extras as extra, i (i)}
			{#if extra.value != null || extra.images?.length}
				<section class="print-section">
					<h2>{extra.title}</h2>
					{#if extra.images?.length}
						<div class="print-figure">
							{#each extra.images as src, j (j)}
								<img {src} alt={`${extra.title} ${j + 1}`} />
							{/each}
						</div>
					{/if}
					{#if extra.value != null}
						{@render block(extra.value, extra.title)}
					{/if}
				</section>
			{/if}
		{/each}

		{#if identifierRows.length || importProvenance}
			<section class="print-section">
				<h2>{tr('extid_title')}</h2>
				{#if importProvenance}
					<p class="print-note">
						{tr('extid_import_source')}:
						{enumLabel('extid_source', String(importProvenance.source ?? '').replace(/-/g, '_'))}
						{#if importProvenance.externalId}· {String(importProvenance.externalId)}{/if}
						{#if importProvenance.license}· {String(importProvenance.license)}{/if}
					</p>
				{/if}
				{#if identifierRows.length}
					<table class="print-table">
						<thead>
							<tr>
								<th>{tr('extid_source')}</th>
								<th>{tr('extid_external_id')}</th>
								<th>{tr('extid_primary')}</th>
							</tr>
						</thead>
						<tbody>
							{#each identifierRows as row, i (i)}
								<tr>
									<td>{row.source}</td>
									<td>
										{#if row.url}
											<a href={row.url}>{row.externalId}</a>
										{:else}
											{row.externalId}
										{/if}
									</td>
									<td>{row.primary ? '✓' : ''}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</section>
		{/if}

		{#if relationRows.length}
			<section class="print-section">
				<h2>{tr('relations_title')}</h2>
				<table class="print-table">
					<thead>
						<tr>
							<th>{tr('relations_title')}</th>
							<th>{tr('print_direction')}</th>
							<th>{tr('print_entity')}</th>
							<th>{tr('print_source')}</th>
						</tr>
					</thead>
					<tbody>
						{#each relationRows as row, i (i)}
							<tr>
								<td>{row.relation}</td>
								<td>{row.direction}</td>
								<td>{row.entity}</td>
								<td>{row.source}{row.note ? ` · ${row.note}` : ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/if}

		{#if wiki}
			<section class="print-section print-wiki">
				<h2>{tr('wiki_title')}</h2>
				{#if typeof wiki.title === 'string' && wiki.title}
					<h3>{wiki.title}</h3>
				{/if}
				{#if typeof wiki.summary === 'string' && wiki.summary}
					<p class="print-wiki-summary">{wiki.summary}</p>
				{/if}
				{#if typeof wiki.bodyMarkdown === 'string' && wiki.bodyMarkdown}
					<div class="print-wiki-body">{wiki.bodyMarkdown}</div>
				{/if}
				{#if Array.isArray(wiki.tags) && wiki.tags.length}
					<p class="print-note">{wiki.tags.map(String).join(' · ')}</p>
				{/if}
			</section>
		{/if}

		{#if referenceRows.length}
			<section class="print-section">
				<h2>{tr('refs_title')}</h2>
				<ol class="print-references">
					{#each referenceRows as row, i (i)}
						<li>
							{#if row.title}<span class="print-ref-title">{row.title}</span>.
							{/if}
							{#if row.authors}{row.authors}.
							{/if}
							{#if row.year}<span>{row.year}</span>.
							{/if}
							<span class="print-ref-source">{row.source} {row.externalId}</span>
							{#if row.url}<a href={row.url}> · {tr('refs_oa_link')}</a>{/if}
						</li>
					{/each}
				</ol>
			</section>
		{/if}

		<footer class="print-footer">
			<span>SPD · {tr('app_tagline')}</span>
			<span>{sourceUrl}</span>
			<span>{generatedAt}</span>
		</footer>
	</article>
</div>

<style>
	.print-screen {
		margin: -1.5rem calc(50% - 50vw);
		padding: 1.5rem 1rem 3rem;
		background: #e7e5e4;
	}

	.print-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		width: min(210mm, calc(100vw - 2rem));
		margin: 0 auto 1rem;
		font-family: var(--font-sans);
	}

	.print-back,
	.print-run {
		font: inherit;
		font-size: 0.875rem;
		line-height: 1.4;
		padding: 0.4rem 0.75rem;
		border: 1px solid #a8a29e;
		background: #fff;
		color: #111;
		text-decoration: none;
		cursor: pointer;
	}

	.print-run {
		background: #111;
		border-color: #111;
		color: #fff;
	}

	.print-doc {
		box-sizing: border-box;
		width: min(210mm, calc(100vw - 2rem));
		min-height: 297mm;
		margin: 0 auto;
		padding: 20mm 22mm 18mm;
		background: #fff;
		color: #111;
		box-shadow: 0 1px 4px rgb(0 0 0 / 0.18);
		font-family: Georgia, 'Times New Roman', 'Songti SC', 'Noto Serif CJK SC', serif;
		font-size: 10.5pt;
		line-height: 1.55;
	}

	.print-head {
		margin-bottom: 14pt;
	}

	.print-category {
		margin: 0 0 4pt;
		color: #555;
		font-family: var(--font-sans);
		font-size: 8.5pt;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}

	.print-title {
		margin: 0;
		font-size: 26pt;
		font-weight: 600;
		line-height: 1.12;
		letter-spacing: -0.01em;
	}

	.print-id {
		margin: 6pt 0 0;
		padding-bottom: 8pt;
		border-bottom: 2px solid #111;
		color: #555;
		font-family: var(--font-mono);
		font-size: 8.5pt;
		overflow-wrap: anywhere;
	}

	.print-lead p {
		margin: 0 0 8pt;
		text-align: justify;
		white-space: pre-line;
	}

	.print-section {
		margin-top: 16pt;
	}

	.print-prose {
		margin: 0 0 8pt;
		text-align: justify;
		white-space: pre-line;
	}

	.print-section h2 {
		margin: 0 0 7pt;
		padding-bottom: 2pt;
		border-bottom: 2px solid #111;
		font-size: 15.5pt;
		font-weight: 600;
		line-height: 1.2;
		break-after: avoid;
	}

	.print-section h3 {
		margin: 10pt 0 4pt;
		font-size: 11.5pt;
		font-weight: 600;
		break-after: avoid;
	}

	.print-facts,
	.print-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 9.2pt;
		line-height: 1.4;
	}

	.print-facts {
		margin: 0 0 10pt;
	}

	.print-facts th,
	.print-facts td {
		padding: 3pt 6pt 3pt 0;
		border-bottom: 0.5pt solid #ddd;
		text-align: left;
		vertical-align: top;
	}

	.print-facts th {
		width: 27%;
		color: #444;
		font-weight: 600;
	}

	.print-facts td {
		overflow-wrap: anywhere;
	}

	.print-table {
		margin: 4pt 0 10pt;
	}

	.print-table th,
	.print-table td {
		padding: 3pt 5pt;
		border-top: 0.5pt solid #999;
		border-bottom: 0.5pt solid #ccc;
		text-align: left;
		vertical-align: top;
		overflow-wrap: anywhere;
	}

	.print-table th {
		font-weight: 600;
	}

	.print-item {
		break-inside: avoid;
		margin-bottom: 8pt;
	}

	.print-list {
		margin: 0 0 10pt;
		padding-left: 1.3em;
	}

	.print-list li {
		margin-bottom: 2pt;
	}

	.print-figure {
		margin: 2pt 0 12pt;
	}

	.print-figure img {
		display: block;
		width: 100%;
		height: auto;
		margin: 0 0 6pt;
		border: 0.5pt solid #ddd;
		background: #fff;
		break-inside: avoid;
	}

	.print-note {
		margin: 0 0 6pt;
		color: #555;
		font-family: var(--font-sans);
		font-size: 8.5pt;
	}

	.print-wiki-summary {
		margin: 0 0 6pt;
		font-style: italic;
	}

	.print-wiki-body {
		white-space: pre-wrap;
		text-align: justify;
	}

	.print-references {
		margin: 0;
		padding-left: 1.4em;
		font-size: 9pt;
	}

	.print-references li {
		margin-bottom: 5pt;
		text-align: left;
	}

	.print-ref-title {
		font-weight: 600;
	}

	.print-ref-source {
		font-family: var(--font-mono);
		font-size: 8pt;
	}

	.print-doc a {
		color: #111;
		text-decoration: none;
		border-bottom: 0.5pt solid #999;
		overflow-wrap: anywhere;
	}

	.print-footer {
		display: flex;
		justify-content: space-between;
		gap: 8pt;
		margin-top: 24pt;
		padding-top: 4pt;
		border-top: 0.5pt solid #999;
		color: #666;
		font-family: var(--font-mono);
		font-size: 7.5pt;
	}

	@media print {
		@page {
			size: A4;
			margin: 18mm 20mm 20mm;
		}

		.print-screen {
			margin: 0;
			padding: 0;
			background: #fff;
		}

		.print-toolbar {
			display: none !important;
		}

		.print-doc {
			width: auto;
			min-height: 0;
			margin: 0;
			padding: 0;
			box-shadow: none;
		}

		.print-footer {
			break-inside: avoid;
		}
	}
</style>
