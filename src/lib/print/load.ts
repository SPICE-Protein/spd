import { externalIdentifiers, references, relations, wiki } from '$lib/api/client';
import { isZh, tr } from '$lib/i18n';
import {
	featureColor,
	renderSequenceImages,
	type SequenceMode,
	type SequenceViewFeature
} from '$lib/gene/renderSequenceImage';
import { asRecord, asRows, labelForKey, publicIdOf, titleOf } from './format';
import type { PrintExtraSection, PrintTarget } from './registry';

const SEQUENCE_KEYS = ['dnaSequence', 'rnaSequence', 'sequence'] as const;

function stripSequenceFields(record: Record<string, unknown>): Record<string, unknown> {
	const copy = { ...record };
	for (const key of SEQUENCE_KEYS) delete copy[key];
	delete copy.normalizedSequence;
	return copy;
}

function modeFor(key: string, record: Record<string, unknown>): SequenceMode {
	if (key === 'dnaSequence') return 'dna';
	if (key === 'rnaSequence') return 'rna';
	const kind = String(record.sequenceType ?? record.moleculeType ?? '').toLowerCase();
	if (kind.includes('rna')) return 'rna';
	if (kind.includes('dna')) return 'dna';
	return 'protein';
}

function regionFeatures(
	rows: Record<string, unknown>[],
	mode: SequenceMode
): SequenceViewFeature[] {
	return rows
		.filter((row) => String(row.molecule ?? '').toLowerCase() === mode)
		.flatMap((row, index) => {
			const start = Number(row.startPosition);
			const end = Number(row.endPosition);
			if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) return [];
			const type = String(row.regionType || row.featureKey || 'other');
			const name = type === 'other' ? String(row.featureKey || 'region') : type;
			return [
				{
					id: index + 1,
					name,
					start,
					end,
					type,
					color: featureColor(type),
					forward: String(row.strand ?? 'forward') !== 'reverse',
					description: String(row.description ?? '')
				}
			];
		});
}

function annotationFeatures(rows: Record<string, unknown>[]): SequenceViewFeature[] {
	return rows.flatMap((row, index) => {
		const start = Number(row.startPosition);
		const end = Number(row.endPosition);
		if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) return [];
		const type = String(row.featureType || 'feature');
		return [
			{
				id: index + 1,
				name: String(row.residue || row.description || type),
				start,
				end,
				type,
				color: featureColor(type),
				forward: true,
				description: String(row.description ?? '')
			}
		];
	});
}

function sequenceSection(
	record: Record<string, unknown>,
	extras: PrintExtraSection[]
): PrintExtraSection[] {
	const sections: PrintExtraSection[] = [];
	const regions = asRows(extras.find((extra) => extra.kind === 'gene-regions')?.value);
	const annotations = asRows(extras.find((extra) => extra.kind === 'annotations')?.value).filter(
		(row) => !row.sequenceId || row.sequenceId === record.id
	);

	for (const key of SEQUENCE_KEYS) {
		const raw = record[key];
		if (typeof raw !== 'string' || !raw.trim()) continue;
		const mode = modeFor(key, record);
		const features =
			mode === 'protein' ? annotationFeatures(annotations) : regionFeatures(regions, mode);
		const images = renderSequenceImages({ sequence: raw, mode, features });
		if (images.length) sections.push({ title: labelForKey(key), images, kind: 'sequence' });
	}
	return sections;
}

function extraWithSequenceImage(
	extra: PrintExtraSection,
	annotations: Record<string, unknown>[]
): PrintExtraSection {
	const value = asRecord(extra.value);
	if (!value) return extra;
	const key = SEQUENCE_KEYS.find(
		(candidate) => typeof value[candidate] === 'string' && value[candidate]
	);
	if (!key) return extra;

	const mode = modeFor(key, value);
	const matching = annotations.filter((row) => !row.sequenceId || row.sequenceId === value.id);
	const images = renderSequenceImages({
		sequence: String(value[key]),
		mode,
		features: mode === 'protein' ? annotationFeatures(matching) : []
	});
	return {
		...extra,
		value: stripSequenceFields(value),
		images: images.length ? images : extra.images
	};
}

export interface PrintDocumentData {
	title: string;
	category: string;
	publicId: string;
	sourceHref: string;
	record: Record<string, unknown>;
	extras: NonNullable<Awaited<ReturnType<PrintTarget['load']>>['extras']>;
	wiki: Record<string, unknown> | null;
	references: Record<string, unknown>[];
	identifiers: Record<string, unknown>[];
	relations: Record<string, unknown>[];
	importProvenance: Record<string, unknown> | null;
	generatedAt: string;
}

async function settle<T>(task: Promise<T>): Promise<T | null> {
	try {
		return await task;
	} catch {
		return null;
	}
}

/**
 * One print page needs the record, the secondary sections its detail page
 * carries, and the community panel. Every community read is optional: a
 * reference outage must not turn a printable record into an error page.
 */
export async function loadPrintDocument(
	target: PrintTarget,
	id: string
): Promise<PrintDocumentData> {
	const payload = await target.load(id);
	const record = asRecord(payload.record) ?? {};
	const type = target.typeOf?.(record) ?? target.type;

	const [wikiResult, refsResult, idsResult, relationsResult] = await Promise.all([
		settle(wiki.get(type, id)),
		settle(references.list(type, id)),
		settle(externalIdentifiers.forEntity(type, id)),
		settle(relations.forEntity(type, id))
	]);

	const wikiEntry = asRecord(wikiResult?.wiki);
	const refsContainer = asRecord(refsResult);
	const referencesRows = Array.isArray(refsResult)
		? refsResult.filter((r) => asRecord(r))
		: asRows(refsContainer?.references);
	const identifierRows = asRows(idsResult?.identifiers);
	const relationRows = asRows(relationsResult?.relations);
	const provenance = asRecord(idsResult?.importProvenance);

	const generatedAt = new Intl.DateTimeFormat(isZh() ? 'zh-CN' : 'en-GB', {
		dateStyle: 'long',
		timeStyle: 'short'
	}).format(new Date());

	const sourceExtras = payload.extras ?? [];
	const annotationRows = asRows(sourceExtras.find((extra) => extra.kind === 'annotations')?.value);
	const sequenceSections = sequenceSection(record, sourceExtras);
	const extras = [
		...sequenceSections,
		...sourceExtras.map((extra) => extraWithSequenceImage(extra, annotationRows))
	];

	return {
		title: titleOf(record, id),
		category: tr(target.titleKey),
		publicId: publicIdOf(record, id),
		sourceHref: `/${target.slug}/${id}`,
		record: stripSequenceFields(record),
		extras,
		wiki: wikiEntry,
		references: referencesRows as Record<string, unknown>[],
		identifiers: identifierRows,
		relations: relationRows,
		importProvenance: provenance,
		generatedAt
	};
}
