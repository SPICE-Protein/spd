/**
 * The fields the correction pipeline can actually land, per entity type.
 *
 * This mirrors `spd_backend/src/modules/corrections/apply.rs` (the
 * `*_FIELDS` registries, in the same order). The correction editor must not
 * offer a key the apply gate refuses, or the contributor spends time on a
 * filing that can only bounce. Keep the two lists in step: add a field here
 * only when its `plan_*`/`replace_*` path exists on the server.
 *
 * Unknown types fall back to the record's own keys (the legacy behaviour);
 * they are not shown a correction door by `isCorrectable` anyway.
 */
export const CORRECTABLE_FIELDS: Record<string, readonly string[]> = {
	protein: [
		'preferredName',
		'geneName',
		'entryName',
		'fullName',
		'ecNumber',
		'sequenceCrc64',
		'sourceEntryStatus',
		'license',
		'annotationScore',
		'massDalton',
		'organism',
		'externalReferences',
		'tags',
		'altNames',
		'geneSynonyms',
		'orfNames',
		'organismLineage',
		'keywords',
		'comments'
	],
	'pdb-entry': [
		'title',
		'experimentalMethod',
		'spaceGroup',
		'resolutionAngstrom',
		'releasedAt',
		'uniprotAccessions',
		'cell',
		'rFactorWork',
		'rFree',
		'assemblyCount',
		'citation',
		'metadata'
	],
	enzyme: [
		'name',
		'ecNumber',
		'enzymeClass',
		'sourceOrganism',
		'substrate',
		'product',
		'optimalPh',
		'optimalTemperature',
		'metadata',
		'proteinId',
		'targetMolecule'
	],
	'restriction-enzyme': [
		'name',
		'recognitionSite',
		'cutPosition',
		'enzymeType',
		'metadata',
		'proteinId',
		'targetMolecule'
	],
	gene: [
		'name',
		'symbol',
		'description',
		'geneType',
		'organism',
		'dnaSequence',
		'rnaSequence',
		'metadata',
		'definition',
		'keywords',
		'comment',
		'locusTag',
		'ncbiGeneId',
		'moleculeType',
		'topology',
		'division',
		'chromosome',
		'mapLocation',
		'strand',
		'organismCommonName',
		'organismLineage',
		'externalReferences'
	],
	biobrick: [
		'name',
		'partType',
		'sequence',
		'description',
		'metadata',
		'categories',
		'parameters',
		'crossReferences'
	],
	strain: ['name', 'species', 'genotype', 'resistanceMarkers', 'background', 'metadata'],
	reagent: [
		'name',
		'reagentType',
		'catalogIdentifier',
		'description',
		'attributes',
		'pubchemCid',
		'iupacName',
		'molecularFormula',
		'molecularWeight',
		'exactMass',
		'monoisotopicMass',
		'charge',
		'xlogp',
		'tpsa',
		'hBondDonorCount',
		'hBondAcceptorCount',
		'rotatableBondCount',
		'heavyAtomCount',
		'complexity',
		'smiles',
		'isomericSmiles',
		'inchi',
		'inchiKey',
		'casNumber',
		'synonyms',
		'identifiers',
		'computedProperties',
		'experimentalProperties',
		'chemicalClasses'
	],
	reaction: [
		'name',
		'ecNumber',
		'substrates',
		'products',
		'cofactors',
		'reversible',
		'equation',
		'source'
	],
	pathway: ['name', 'description', 'source'],
	'cell-line': [
		'name',
		'species',
		'source',
		'growthConditions',
		'metadata',
		'category',
		'sex',
		'age',
		'speciesTaxId',
		'doublingTime',
		'microsatelliteInstability',
		'parentAccession',
		'parentName',
		'children',
		'synonyms',
		'diseases',
		'derivedFromSite',
		'transformant',
		'omics',
		'genomeAncestry',
		'hlaTyping',
		'strProfile',
		'comments',
		'crossReferences',
		'webPages',
		'references'
	]
};

export function correctableFieldKeys(
	entityType: string | null | undefined
): readonly string[] | null {
	if (!entityType) return null;
	const normalized = entityType.replace(/_/g, '-');
	return CORRECTABLE_FIELDS[normalized] ?? null;
}
