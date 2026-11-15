/**
 * The formats every record with letters can leave in.
 *
 * Pages already spell out their FASTA, GenBank and SBOL3 entries because those
 * differ per record type (a gene has two FASTAs, a vector has circularity).
 * Everything else is the same projection of the same record, so it is built
 * once here and spread into each page's menu.
 */

import { tr } from '$lib/i18n';
import type { ExportSequence } from './bio';
import type { ExportFormat } from './types';
import {
	toBed,
	toEmbl,
	toFeatureTable,
	toGff3,
	toRecordJson,
	toSbol2,
	type SequenceMeta
} from './formats';

export interface ProjectionMenus {
	base: string;
	/** Read lazily so the menu always sees the record the page currently holds. */
	record: () => ExportSequence;
	meta?: () => SequenceMeta;
	/** The record as the API returned it, for the JSON entry. */
	json?: () => unknown;
	disabled?: boolean;
}

export function projectionFormats(input: ProjectionMenus): ExportFormat[] {
	const off = input.disabled ?? false;
	const meta = () => input.meta?.() ?? {};
	const formats: ExportFormat[] = [
		{
			key: 'embl',
			label: tr('export_embl'),
			filename: `${input.base}.embl`,
			disabled: off,
			build: () => toEmbl(input.record(), meta())
		},
		{
			key: 'gff3',
			label: tr('export_gff3'),
			filename: `${input.base}.gff3`,
			disabled: off,
			build: () => toGff3(input.record(), meta())
		},
		{
			key: 'bed',
			label: tr('export_bed'),
			filename: `${input.base}.bed`,
			disabled: off,
			build: () => toBed(input.record(), meta())
		},
		{
			key: 'features-csv',
			label: tr('export_features_csv'),
			filename: `${input.base}.features.csv`,
			mime: 'text/csv;charset=utf-8',
			disabled: off,
			build: () => toFeatureTable(input.record())
		},
		{
			key: 'features-tsv',
			label: tr('export_features_tsv'),
			filename: `${input.base}.features.tsv`,
			mime: 'text/tab-separated-values;charset=utf-8',
			disabled: off,
			build: () => toFeatureTable(input.record(), { delimiter: '\t' })
		},
		{
			key: 'sbol2',
			label: tr('export_sbol2'),
			filename: `${input.base}.sbol2.xml`,
			mime: 'application/rdf+xml',
			disabled: off,
			build: () => toSbol2(input.record(), meta())
		}
	];
	if (input.json) {
		const read = input.json;
		formats.push({
			key: 'record-json',
			label: tr('export_record_json'),
			filename: `${input.base}.json`,
			mime: 'application/json',
			disabled: off,
			build: () => toRecordJson(read())
		});
	}
	return formats;
}
