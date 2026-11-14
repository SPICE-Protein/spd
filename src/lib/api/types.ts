/**
 * Wire types. Everything on the SPD wire is camelCase (response-contract lock).
 * Typed records/inputs come straight from the generated openapi schema; envelope
 * catalog reads are free-form in the spec, so those rows are declared here per
 * FEATURE_LIST §19–§35.
 */
import type { components } from './schema';

type S = components['schemas'];

// ---------- core scientific records (typed in the spec) ----------
export type ProteinRecord = S['ProteinRecord'];
export type ProteinInput = S['ProteinInput'];
export type SequenceRecord = S['SequenceRecord'];
export type SequenceInput = S['SequenceInput'];
export type EnvironmentRecord = S['EnvironmentRecord'];
export type EnvironmentInput = S['EnvironmentInput'];
export type ModelRecord = S['ModelRecord'];
export type ModelInput = S['ModelInput'];
export type FoldRecord = S['FoldRecord'];
export type FoldInput = S['FoldInput'];
export type FoldArtifactsData = S['FoldArtifactsData'];
export type FoldArtifactRecord = S['FoldArtifactRecord'];
export type FoldHistoryData = S['FoldHistoryData'];
export type ValidationRecord = S['ValidationRecord'];
export type ValidationInput = S['ValidationInput'];
export type ReviewRecord = S['ReviewRecord'];
export type ReviewInput = S['ReviewInput'];
export type ReviewSummary = S['ReviewSummary'];
export type ScreeningEventRecord = S['ScreeningEventRecord'];
export type RevisionRecord = S['RevisionRecord'];
export type CommentRecord = S['CommentRecord'];
export type CommentInput = S['CommentInput'];
export type CanonicalAssessmentRecord = S['CanonicalAssessmentRecord'];
export type AssessmentInput = S['AssessmentInput'];
export type MdVerificationRecord = S['MdVerificationRecord'];
export type ValidationDigest = S['ValidationDigest'];
export type StabilityScanRecord = S['StabilityScanRecord'];
export type SequenceStructuresData = S['SequenceStructuresData'];
export type SequenceStructureMatch = S['SequenceStructureMatch'];
export type SequenceStructureEntry = S['SequenceStructureEntry'];
export type SequenceStructureEntity = S['SequenceStructureEntity'];
export type SequenceStabilityDomainData = S['SequenceStabilityDomainData'];
export type PocketAnalysisRecord = S['PocketAnalysisRecord'];
export type ObservedStructureRecord = S['ObservedStructureRecord'];
export type ArtifactRecord = S['ArtifactRecord'];
export type ArtifactInput = S['ArtifactInput'];
export type PreflightInput = S['PreflightInput'];
/** preflight response is a bare documented object (not a registered schema component) */
export interface PreflightResponse {
	uploadUrl: string;
	objectKey: string;
	token: string;
	expiresIn: number;
	method: string;
}
/** yellow-pages supplier write body (camelCase on the wire) */
export interface SupplierInput {
	organizationId: string;
	catalogNumber?: string | null;
	orderUrl?: string | null;
	orderEmail?: string | null;
	notes?: string | null;
	description?: string | null;
	attributes?: unknown;
}
export type LineageNode = S['LineageNode'];
export type LineageEdge = S['LineageEdge'];
export type SessionData = S['SessionData'];
export type ResearcherApplicationInput = S['ResearcherApplicationInput'];
export type SessionUser = NonNullable<SessionData['user']>;
export type SessionRole = NonNullable<SessionData['roles']>[number];

/** write receipts — bare objects, camelCase */
export type CreateReceipt<T> = { entity?: never } & Record<string, unknown>;
export interface ProteinCreateReceipt {
	protein: Pick<ProteinRecord, 'id' | 'preferredName'> & Partial<ProteinRecord>;
	created: boolean;
	deduplicated?: boolean;
}
export interface SequenceCreateReceipt {
	sequence: SequenceRecord;
	created: boolean;
	deduplicated?: boolean;
}
export interface CompactReceipt {
	id: string;
	created: boolean;
	deduplicated?: boolean;
	[key: string]: unknown;
}

// ---------- auth & account ----------
export interface LogoutReceipt {
	ok: boolean;
}
export interface ResearcherApplicationRow {
	id: string;
	status: string;
	institutionName: string;
	department?: string | null;
	position?: string | null;
	institutionEmail?: string | null;
	researchPurpose?: string;
	organizationVerificationId?: string | null;
	createdAt?: number;
	expiresAt?: number;
	reviewedAt?: number | null;
	reviewNote?: string | null;
	[key: string]: unknown;
}
export interface ResearcherApplicationReceipt {
	applicationId: string;
	status: string;
	verification: { channel: string; address: string | null; instructions: string };
}

// ---------- organizations ----------
export interface OrganizationSummary {
	id: string; // verification_id (ORG-…)
	name: string;
	department?: string | null;
	domain?: string | null;
	status: string;
	verifiedAt?: number | null;
	sponsorLevel?: string;
	profile?: Record<string, unknown>;
}
export interface OrganizationStats {
	vectorCount: number;
	restrictionEnzymeCount: number;
	reagentCount: number;
	materialsCount: number;
	memberCount: number;
	reviewCountLastQuarter: number;
	wetLabCountLastHalfYear: number;
	complianceStatus?: string;
}
export interface OrganizationMemberRow {
	/** orcid id */
	id: string;
	displayName: string;
	role: string;
}
export interface OrganizationHome {
	organization: OrganizationSummary;
	stats: OrganizationStats;
	members: OrganizationMemberRow[];
}
export interface OrgMembershipRow {
	/** internal uuid; the memberships endpoint deliberately exposes only the
	 *  public verification id, so callers must not depend on this being set */
	organizationId?: string;
	verificationId: string;
	name: string;
	role: string;
	memberStatus: string;
	[key: string]: unknown;
}
export interface LeaderboardEntry {
	orcidId: string;
	displayName: string;
	factor: number;
	validationCount: number;
}
export interface SupplierRow {
	id?: string;
	organizationId?: string;
	organizationName?: string;
	catalogNumber?: string | null;
	orderUrl?: string | null;
	orderEmail?: string | null;
	notes?: string | null;
	description?: string | null;
	verified?: boolean;
	[key: string]: unknown;
}

// ---------- admin ----------
export interface EditorialTask {
	id: string;
	taskType: string;
	entityType?: string;
	entityId?: string;
	summary?: string;
	status: string;
	assigneeId?: string | null;
	assignerId?: string | null;
	claimedAt?: number | null;
	resolvedAt?: number | null;
	resolution?: string | null;
	createdAt: number;
	[key: string]: unknown;
}
export interface AdminUserRow {
	user: SessionUser & { createdAt?: number; lastLoginAt?: number | null };
	roles: Array<{
		role: string;
		grantedAt?: number;
		expiresAt: number | null;
		revokedAt?: number | null;
	}>;
	[key: string]: unknown;
}
export interface AdminDecisionReceipt {
	ok: boolean;
	status: string;
	emailDeliveryId?: string | null;
	[key: string]: unknown;
}

// ---------- staff inbox listings (§4.2) ----------
export interface AdminApplicationRow {
	id: string;
	userId: string;
	orcidId: string;
	applicantName?: string | null;
	institutionName: string;
	department?: string | null;
	position?: string | null;
	institutionEmail?: string | null;
	researchPurpose: string;
	status: string;
	createdAt: number;
	submittedAt?: number | null;
	emailReceivedAt?: number | null;
	reviewedAt?: number | null;
	reviewNote?: string | null;
	expiresAt?: number | null;
}
export interface AdminClaimRow {
	id: string;
	organizationId: string;
	organizationName: string;
	organizationStatus: string;
	applicantUserId: string;
	applicantName?: string | null;
	applicantOrcid?: string | null;
	status: string;
	evidenceSummary: string;
	evidenceEmail?: string | null;
	createdAt: number;
	reviewedAt?: number | null;
	reviewNote?: string | null;
}
export interface AdminAuditRow {
	id: string;
	actorUserId?: string | null;
	actorName?: string | null;
	actorOrcid?: string | null;
	action: string;
	resourceType?: string | null;
	resourceId?: string | null;
	metadata: unknown;
	createdAt: number;
}
// Staff view of one comment thread — includes moderated rows the public
// thread hides, so a hide is never a dead end.
export interface AdminCommentRow {
	id: string;
	entityType: string;
	entityId: string;
	parentCommentId?: string | null;
	body: string;
	status: string;
	createdBy: string;
	createdAt: number;
}
// Admin view of a community filing (api_records row). `id` is the PUBLIC id —
// every admin route resolves `id = ? OR public_id = ?`, so it always round-trips.
export interface AdminRecordRow {
	id: string;
	entityType: string;
	payload: unknown;
	status: string;
	hidden: boolean;
	createdBy: string;
	createdAt: number;
	updatedAt: number;
}

// ---------- sequences tree/lineage ----------
export interface SequenceLineageData {
	rootSequenceId: string;
	nodes: Array<{
		id: string;
		sequence?: string;
		sha256?: string;
		parentSequenceId?: string | null;
		isNative?: boolean;
		sequenceRole?: 'native' | 'mutant' | 'variant';
		mutations?: unknown;
	}>;
	edges: Array<{ from: string; to: string }>;
}
export interface SequenceTreeData {
	rootSequenceId: string;
	nodes: Array<{
		id: string;
		depth: number;
		sequence?: string;
		sha256?: string;
		mutations?: unknown;
		parentSequenceId?: string | null;
		isNative?: boolean;
		sequenceRole?: 'native' | 'mutant' | 'variant';
	}>;
	edges: Array<{ from: string; to: string }>;
	nodeCount: number;
	maxDepth: number;
}

// ---------- catalogs (envelope data free-form; rows per FEATURE_LIST) ----------
export interface RestrictionEnzymeRow {
	id: string;
	name: string;
	recognitionSite: string;
	cutPosition: string;
	enzymeType: string;
	/** §56 — what this cutter claims to act on; an RNase row says `rna`. */
	targetMolecule?: string | null;
	[key: string]: unknown;
}
export interface RestrictionEnzymeDetail extends RestrictionEnzymeRow {
	/** Where this record came from: `community` or an imported catalog source. */
	source?: string | null;
	sourceRelease?: string | null;
	sourceFetchedAt?: number | null;
	license?: string | null;
	citation?: string | null;
	metadata?: Record<string, unknown>;
	suppliers?: SupplierRow[];
}
export interface BiobrickRow {
	id: string;
	name: string;
	partType: string;
	length?: number;
	sequenceLength?: number;
	description?: string | null;
	[key: string]: unknown;
}
export interface EnzymeDetail extends EnzymeRow {
	suppliers?: SupplierRow[];
	/** Newest BRENDA provenance for this row's EC number; absent until fetched. */
	brenda?: EnzymeBrendaMeta | null;
}

/** Release-level provenance shared by every organism entry for one EC. */
export interface EnzymeBrendaMeta {
	release?: string | null;
	fetchedAt?: number | null;
	license?: string | null;
	citation?: string | null;
}

/** Receipt from POST /enzymes/{id}/brenda. */
export interface EnzymeBrendaFetch {
	ecNumber: string;
	fetched: boolean;
	release?: string | null;
	fetchedAt?: number | null;
	created: number;
	updated: number;
	unchanged: number;
	entries: number;
	license?: string | null;
	citation?: string | null;
}
export interface EnzymeRow {
	id: string;
	name: string;
	ecNumber?: string | null;
	enzymeClass: string;
	sourceOrganism?: string | null;
	substrate?: string | null;
	product?: string | null;
	optimalPh?: number | null;
	optimalTemperature?: number | null;
	/** §56 — `dna|rna|other`, default `dna`. */
	targetMolecule?: string | null;
	/** Where this record came from: `community` or an imported catalog source. */
	source?: string | null;
	sourceRelease?: string | null;
	sourceFetchedAt?: number | null;
	license?: string | null;
	citation?: string | null;
	/** BRENDA per-organism entries attached to this EC number. */
	sourceEntries?: EnzymeSourceEntry[];
	metadata?: Record<string, unknown>;
	[key: string]: unknown;
}

/** One BRENDA entry, projected for the enzyme page. The upstream accession
 *  is deliberately absent: SPD shows the source and the values, not the
 *  provider's own login number. */
export interface EnzymeSourceEntry {
	id: string;
	source: string;
	name: string;
	organism?: string | null;
	/** Only researcher-contributed rows carry a citation. */
	citation?: string | null;
	/** Zipped supplementary material attached to a community entry. */
	artifactIds?: string[];
	data: Record<string, unknown>;
}

/** Body of POST /enzymes/{id}/species-data. */
export interface EnzymeSpeciesDataInput {
	organism: string;
	fields: Record<string, string[]>;
	citation?: string;
	artifactIds?: string[];
}

// ---------- genes (FEATURE_LIST §55) ----------
/** One cross-reference the upstream entry asserts (GenBank DBLINK et al.). */
export interface GeneExternalReference {
	source: string;
	externalId: string;
	url?: string | null;
	license?: string | null;
}
/** One raw GenBank feature qualifier, verbatim (`/note`, `/db_xref`, …). */
export interface GeneRegionQualifier {
	key: string;
	value: string;
}
export type GeneStrand = 'forward' | 'reverse' | 'unknown';
/** A gene record carries its OWN asserted sequences — no derived RNA. */
export interface GeneRecord {
	id: string;
	name: string;
	symbol?: string | null;
	description?: string | null;
	geneType?: string | null;
	organism?: { taxId?: number | null; scientificName?: string | null };
	dnaSequence?: string | null;
	rnaSequence?: string | null;
	dnaLength?: number | null;
	rnaLength?: number | null;
	metadata?: unknown;
	createdAt?: number;
	// upstream NCBI/GenBank plate — stored source assertions, never computed
	/** bare accession, e.g. `NM_000546` */
	accession?: string | null;
	/** versioned accession, e.g. `NM_000546.6` */
	accessionVersion?: string | null;
	definition?: string | null;
	keywords?: string[] | null;
	comment?: string | null;
	locusTag?: string | null;
	ncbiGeneId?: number | null;
	moleculeType?: string | null;
	topology?: 'linear' | 'circular' | null;
	division?: string | null;
	chromosome?: string | null;
	mapLocation?: string | null;
	strand?: GeneStrand | null;
	organismCommonName?: string | null;
	organismLineage?: string[] | null;
	externalReferences?: GeneExternalReference[] | null;
	sequenceVersion?: number | null;
	/** epoch seconds */
	sourceUpdatedAt?: number | null;
	[key: string]: unknown;
}
export interface GeneListRow {
	id: string;
	name: string;
	symbol?: string | null;
	geneType?: string | null;
	organismScientificName?: string | null;
	dnaLength?: number | null;
	rnaLength?: number | null;
	accession?: string | null;
	locusTag?: string | null;
	moleculeType?: string | null;
	[key: string]: unknown;
}
export interface GeneRegionRow {
	id: string;
	geneId: string;
	molecule: string;
	regionType: string;
	startPosition?: number | null;
	endPosition?: number | null;
	description: string;
	proteinId?: string | null;
	createdAt?: number;
	// raw upstream feature evidence beside the normalized region vocabulary
	/** GenBank feature key, e.g. `misc_feature` */
	featureKey?: string | null;
	/** raw location string, e.g. `complement(join(1..2,9..10))` */
	location?: string | null;
	strand?: GeneStrand | null;
	qualifiers?: GeneRegionQualifier[] | null;
	/** NP_/XP_ accession — an upstream protein id, not an SPD public id */
	externalProteinId?: string | null;
	[key: string]: unknown;
}
export interface GeneRegionsData {
	items: GeneRegionRow[];
	[key: string]: unknown;
}
export interface ReactionRow {
	id: string;
	name: string;
	ecNumber?: string | null;
	ecNumbers?: string[];
	substrates?: unknown;
	products?: unknown;
	cofactors?: unknown;
	reversible?: number | boolean;
	equation?: string | null;
	rheaId?: string | null;
	rheaStatus?: string | null;
	chemicallyBalanced?: boolean | null;
	transport?: boolean | null;
	comment?: string | null;
	participants?: Array<{ chebiId?: string; name?: string; side?: string; smiles?: string }>;
	goTerms?: Array<{ id?: string; label?: string }>;
	crossReferences?: Array<{ database?: string; accession?: string }>;
	relatedReactions?: Array<{ relation?: string; id?: string; equation?: string }>;
	publications?: Array<{ database?: string; id?: string }>;
	directions?: Array<{ direction?: string; id?: string; equation?: string }>;
	enzymeCount?: number | null;
	enzymes?: Array<{
		accession?: string;
		name?: string;
		ecNumber?: string;
		reviewed?: boolean;
	}>;
	source?: unknown;
	[key: string]: unknown;
}
export interface PathwayTopologyCompartment {
	id: string;
	sbmlId: string;
	name: string;
}
export interface PathwayTopologyEntity {
	id: string;
	sbmlId: string;
	name: string;
	compartment: string;
	entityType?: string | null;
	uniprot: string[];
}
export interface PathwayTopologyParticipant {
	entity: string;
	stoichiometry: number;
}
export interface PathwayTopologyModifier {
	entity: string;
	role: string;
}
export interface PathwayTopologyReaction {
	id: string;
	sbmlId: string;
	name: string;
	reversible: boolean;
	compartment: string;
	equation?: string | null;
	description?: string | null;
	reactants: PathwayTopologyParticipant[];
	products: PathwayTopologyParticipant[];
	modifiers: PathwayTopologyModifier[];
	pubmed: string[];
}
/** SPD's own diagram format (`spd-pathway-topology/1`), projected from SBML. */
export interface PathwayTopology {
	format: string;
	source: string;
	stableId: string;
	name: string;
	compartments: PathwayTopologyCompartment[];
	entities: PathwayTopologyEntity[];
	reactions: PathwayTopologyReaction[];
}
export interface PathwayRow {
	id: string;
	name: string;
	description?: string | null;
	topology?: PathwayTopology | null;
	[key: string]: unknown;
}
export interface PathwayStepRow {
	id: string;
	reactionId?: string;
	reactionName?: string;
	enzymeId?: string | null;
	stepOrder: number;
	[key: string]: unknown;
}
export interface StrainRow {
	id: string;
	name: string;
	species?: string | null;
	genotype?: string | null;
	resistanceMarkers?: unknown;
	background?: string | null;
	[key: string]: unknown;
}
export interface CellLineRow {
	id: string;
	name: string;
	species?: string | null;
	source?: string | null;
	growthConditions?: unknown;
	accession?: string | null;
	category?: string | null;
	sex?: string | null;
	age?: string | null;
	speciesTaxId?: number | null;
	doublingTime?: string | null;
	microsatelliteInstability?: string | null;
	parentAccession?: string | null;
	parentName?: string | null;
	childCount?: number | null;
	children?: Array<{ accession?: string; name?: string }>;
	entryVersion?: number | null;
	upstreamCreated?: string | null;
	upstreamUpdated?: string | null;
	synonyms?: string[];
	diseases?: string[];
	derivedFromSite?: Array<{
		siteType?: string;
		value?: string;
		xrefs?: Array<{ database?: string; accession?: string; label?: string; url?: string }>;
	}>;
	transformant?: Array<{ database?: string; accession?: string; label?: string; url?: string }>;
	omics?: Array<{ branch?: string; value?: string }>;
	genomeAncestry?: Array<{ population?: string; percentage?: string }>;
	hlaTyping?: Array<{ gene?: string; alleles?: string; source?: string }>;
	strProfile?: Array<{ marker?: string; alleles?: string; conflict?: boolean }>;
	comments?: Array<{ category?: string; value?: string }>;
	crossReferences?: Array<{
		database?: string;
		accession?: string;
		category?: string;
		url?: string;
	}>;
	webPages?: Array<{ category?: string; url?: string; institution?: string; specifier?: string }>;
	references?: Array<{ id?: string; citation?: string }>;
	metadata?: unknown;
	[key: string]: unknown;
}
export interface MediaRecipeRow {
	id: string;
	name: string;
	category: string;
	composition?: unknown;
	ph?: number | null;
	notes?: string | null;
	[key: string]: unknown;
}
export interface ConditionTemplateRow {
	id: string;
	name: string;
	kind: string;
	template?: unknown;
	description?: string | null;
	[key: string]: unknown;
}
export interface ReagentRow {
	id: string;
	name: string;
	reagentType: string;
	catalogIdentifier?: string | null;
	description?: string | null;
	attributes?: unknown;
	pubchemCid?: number | null;
	iupacName?: string | null;
	molecularFormula?: string | null;
	molecularWeight?: number | null;
	exactMass?: number | null;
	monoisotopicMass?: number | null;
	charge?: number | null;
	xlogp?: number | null;
	tpsa?: number | null;
	hBondDonorCount?: number | null;
	hBondAcceptorCount?: number | null;
	rotatableBondCount?: number | null;
	heavyAtomCount?: number | null;
	complexity?: number | null;
	smiles?: string | null;
	isomericSmiles?: string | null;
	inchi?: string | null;
	inchiKey?: string | null;
	casNumber?: string | null;
	synonyms?: string[];
	identifiers?: Array<{ label?: string; value?: string; url?: string }>;
	computedProperties?: Array<{ name?: string; value?: string; unit?: string }>;
	experimentalProperties?: Array<{ name?: string; value?: string; unit?: string }>;
	chemicalClasses?: string[];
	pubchemSections?: PubchemSection[];
	upstreamCreated?: string | null;
	upstreamUpdated?: string | null;
	[key: string]: unknown;
}
export interface PubchemSection {
	heading: string;
	description?: string;
	information?: Array<{ value: string; unit?: string; reference?: string }>;
	sections?: PubchemSection[];
}
export interface VectorRow {
	id: string;
	name: string;
	topology: string;
	format?: string | null;
	schemaVersion?: string | null;
	sequenceArtifactId?: string | null;
	features?: unknown;
	insertionSites?: unknown;
	[key: string]: unknown;
}
export interface VectorDetail extends VectorRow {
	suppliers?: SupplierRow[];
}
export interface CassetteRow {
	id: string;
	parts?: unknown;
	hostSystem?: unknown;
	order?: unknown;
	translation?: unknown;
	codonUsage?: unknown;
	[key: string]: unknown;
}
export interface ConstructRow {
	id: string;
	vectorTemplateId?: string;
	expressionCassetteId?: string;
	assembledSequenceSha256?: string | null;
	validationStatus?: string | null;
	metadata?: unknown;
	[key: string]: unknown;
}
export interface CodonSpeciesUsage {
	taxonId?: number | null;
	scientificName?: string | null;
	geneticCodeTableId?: string | null;
	codonMap?: Record<string, number> | null;
	explicit?: boolean;
	[key: string]: unknown;
}
export interface CodonUsageRow {
	id: string;
	source: string;
	taxonId?: number | null;
	selectionMode: string;
	// the API projects the digest as snapshotSha256; mapSnapshotSha256 kept for older callers
	snapshotSha256?: string | null;
	mapSnapshotSha256?: string;
	codonMap?: Record<string, unknown> | null;
	/** "single" or "multi"; multipart datasets carry `species[]` instead of one top-level map */
	snapshotKind?: string | null;
	title?: string | null;
	geneticCodeTableId?: string | null;
	species?: CodonSpeciesUsage[];
	speciesCount?: number;
	sourceUrl?: string | null;
	license?: string | null;
	createdAt?: number;
	[key: string]: unknown;
}
export interface GeneticCodeRow {
	id: string;
	ncbiTableId: number;
	name: string;
	description?: string | null;
	codonToAa: Record<string, string>;
	startCodons?: string[];
	stopCodons?: string[];
	source?: string;
	sourceUrl?: string | null;
	license?: string | null;
	createdAt?: number;
	updatedAt?: number;
	[key: string]: unknown;
}
export interface GeneticCodeSpeciesBinding {
	taxonId: number;
	scientificName?: string | null;
	source?: string;
	sourceUrl?: string | null;
	updatedAt?: number;
	[key: string]: unknown;
}
export interface SpeciesGeneticCodeData {
	taxonId: number;
	scientificName?: string | null;
	geneticCodeTableId: string;
	explicit: boolean;
	source?: string;
	sourceUrl?: string | null;
	table: GeneticCodeRow;
	createdAt?: number | null;
	updatedAt?: number | null;
	[key: string]: unknown;
}
/** Candidate PDB chains that likely belong to a sequence but whose letters
 * are not an exact SHA match (initiator Met, signal peptide, isoform). The
 * backend derives them from shared UniProt accessions; a human confirms or
 * rejects each one and the decision is persisted. */
export type StructureCandidateDecision = 'pending' | 'confirmed' | 'rejected';
export interface SequenceStructureCandidate {
	pdbEntryId: string;
	pdbId: string;
	title?: string | null;
	experimentalMethod?: string | null;
	resolutionAngstrom?: number | null;
	releasedAt?: number | null;
	coordinatesArtifactId?: string | null;
	hasCoordinates: boolean;
	entityId: number;
	description?: string | null;
	chainNames: string[];
	residueCount?: number | null;
	uniprotAccessions: string[];
	relation: string;
	identity?: number | null;
	coverage?: number | null;
	decision: StructureCandidateDecision;
	note?: string | null;
	decidedAt?: number | null;
}
export interface SequenceStructureCandidatesData {
	sequenceId: string;
	candidates: SequenceStructureCandidate[];
}
export interface StructureCandidateDecisionReceipt {
	sequenceId: string;
	pdbId: string;
	entityId: number;
	decision: 'confirmed' | 'rejected' | null;
	updated: boolean;
}

/** One declared mutation joined to the annotations and measured effects that
 * share its sequence position. `inStructure` is true only when an exact-match
 * PDB entity exists, so residue numbering is 1:1 rather than guessed. */
export interface SequenceMutationAnnotation {
	id?: string | null;
	featureType: string;
	startPosition?: number | null;
	endPosition?: number | null;
	description?: string | null;
}
export interface SequenceMutationMapping {
	index: number;
	position: number;
	from?: string | null;
	to?: string | null;
	effectClass?: string | null;
	effectCount?: number;
	annotations: SequenceMutationAnnotation[];
	inDomain: boolean;
	inStructure: boolean;
}
export interface SequenceMutationMapData {
	sequenceId: string;
	length: number;
	sequenceRole?: string | null;
	mutations: SequenceMutationMapping[];
	structures: Array<{
		pdbId: string;
		entityId: number;
		chainNames: string[];
		residueCount?: number | null;
	}>;
	annotated: boolean;
	structureAvailable: boolean;
}

/** A field-level upstream proposition. `protected` fields are shown but can
 * never be applied automatically: they hold the contributor's own assertion. */
export interface GeneSourceRefreshField {
	field: string;
	old: unknown;
	new: unknown;
	protected: boolean;
	/** Upstream value at the last accepted sync. */
	base?: unknown;
	/** False for legacy rows with no stored baseline. */
	baseKnown?: boolean;
	/** The local row changed since that baseline. */
	localModified?: boolean;
	/** Both local and upstream moved, and they disagree. */
	conflict?: boolean;
}
export interface GeneSourceRefreshProposal {
	id: string;
	status: 'pending' | 'applied' | 'dismissed';
	fetchedAt: number;
	sourceUpdatedAt?: number | null;
	fields: GeneSourceRefreshField[];
	createdAt: number;
}
export interface GeneSourceRefreshData {
	geneId: string;
	source: {
		kind: string;
		accession?: string | null;
		accessionVersion?: string | null;
		fetchedAt?: number | null;
		sourceUpdatedAt?: number | null;
		ageDays?: number | null;
		stale: boolean;
	};
	proposal: GeneSourceRefreshProposal | null;
}

/** Generic upstream refresh for every imported catalog except genes. The
 * source plate is identified by the crosswalk's external id, not by an
 * accession buried in the record. */
export interface EntityRefreshField {
	field: string;
	old: unknown;
	new: unknown;
	protected: boolean;
	base?: unknown;
	baseKnown?: boolean;
	localModified?: boolean;
	conflict?: boolean;
}
export interface EntityRefreshProposal {
	id: string;
	status: 'pending' | 'applied' | 'dismissed';
	source: string;
	fetchedAt: number;
	sourceUpdatedAt?: number | null;
	fields: EntityRefreshField[];
	createdAt: number;
}
export interface EntityRefreshSource {
	kind: string;
	externalId?: string | null;
	url?: string | null;
	fetchedAt?: number | null;
	sourceUpdatedAt?: number | null;
	ageDays?: number | null;
	stale: boolean;
}
export interface EntityRefreshData {
	entityType: string;
	entityId: string;
	source: EntityRefreshSource;
	proposal: EntityRefreshProposal | null;
}
export interface EntityRefreshApplyData {
	entityType: string;
	entityId: string;
	changed: unknown[];
	drifted: unknown[];
	source: EntityRefreshSource;
	proposal: EntityRefreshProposal;
}
export interface EntityRefreshDismissData {
	entityType: string;
	entityId: string;
	proposal: EntityRefreshProposal;
}

export interface MutationSetRow {
	id: string;
	baseSequenceId: string;
	resultSequenceId?: string | null;
	mutations?: unknown;
	provenance?: unknown;
	createdAt?: number;
	[key: string]: unknown;
}

// ---------- deep data ----------
export interface MeasurementRow {
	id: string;
	measurementType: string;
	sequenceId: string;
	validationId: string;
	constructId?: string | null;
	ligand?: unknown;
	conditions?: unknown;
	value?: { value?: number; unit?: string } & Record<string, unknown>;
	notes?: string | null;
	provenance?: unknown;
	createdBy?: string;
	createdAt?: number;
	[key: string]: unknown;
}
export interface MutationEffectRow {
	id: string;
	sequenceId: string;
	positions: number[];
	fromResidues?: string[];
	toResidues?: string[];
	effectClass: string;
	dgValue?: number | null;
	interactionTerm?: number | null;
	environment?: unknown;
	confidence?: number | null;
	createdAt?: number;
	[key: string]: unknown;
}
export interface MutationEffectAggregate {
	position: number;
	measuredCount: number;
	effects: Record<string, number>;
	dominantEffect: string;
	avgDg?: number | null;
}
export interface InteractionRow {
	id: string;
	foldAId: string;
	foldBId: string;
	interactionType: string;
	affinityKd?: number | null;
	bindingSites?: unknown;
	notes?: string | null;
	createdAt?: number;
	[key: string]: unknown;
}
export interface FamilyRow {
	id: string;
	name: string;
	description?: string | null;
	memberCount?: number;
	[key: string]: unknown;
}
export interface FamilyDetail extends FamilyRow {
	members?: Array<{
		id?: string;
		sequenceId: string;
		orthologOfSequenceId?: string | null;
		conservedSites?: unknown;
		[key: string]: unknown;
	}>;
}
export interface ComparisonRow {
	id: string;
	foldId: string;
	referenceKind: string;
	referenceId: string;
	metric?: Record<string, number>;
	method: string;
	methodVersion?: string | null;
	notes?: string | null;
	createdAt?: number;
	[key: string]: unknown;
}

// ---------- protocols ----------
export interface ProtocolRow {
	id: string;
	title: string;
	summary?: string | null;
	bodyMarkdown?: string;
	steps?: unknown;
	reagents?: unknown;
	targets?: unknown;
	tags?: unknown;
	revisionNumber: number;
	status: string;
	published?: boolean;
	reviewCount?: number;
	createdBy?: string;
	createdAt?: number;
	updatedAt?: number;
	[key: string]: unknown;
}
export interface ProtocolDetail extends ProtocolRow {
	reviews?: Array<{
		id: string;
		reviewerId?: string;
		reviewerName?: string | null;
		orcidId?: string | null;
		revisionNumber: number;
		decision: string;
		comments?: string | null;
		status: string;
		createdAt?: number;
	}>;
	revisions?: Array<{
		id?: string;
		revisionNumber: number;
		changeSummary?: string;
		editedBy?: string;
		createdAt?: number;
	}>;
}

// ---------- wiki & references ----------
export interface WikiEntry {
	id?: string;
	publicId?: string;
	entityType: string;
	entityId: string;
	title: string;
	summary?: string | null;
	bodyMarkdown: string;
	tags?: string[];
	crossReferences?: unknown;
	related?: unknown;
	status: string;
	revisionNumber: number;
	createdBy?: string;
	createdAt?: number;
	updatedAt?: number;
	[key: string]: unknown;
}
export interface WikiData {
	wiki: WikiEntry | null;
}
export interface WikiRevisionRow {
	id?: string;
	wikiId?: string;
	revisionNumber: number;
	title: string;
	bodyMarkdown?: string;
	summary?: string | null;
	tags?: string[];
	crossReferences?: unknown;
	changeSummary?: string;
	editedBy?: string;
	createdAt?: number;
}
export interface ReferenceRow {
	id: string;
	source: string;
	externalId: string;
	title?: string | null;
	authors?: string[];
	year?: number | null;
	oaUrl?: string | null;
	addedBy?: string;
	createdAt?: number;
	[key: string]: unknown;
}
export interface ReferenceRefreshData {
	title?: string | null;
	year?: number | null;
	oaUrl?: string | null;
	citationCount?: number | null;
	cached?: boolean;
	[key: string]: unknown;
}
/** `GET /references/lookup` — a citation preview before attaching. The
 * backend swallows every fetch failure into `resolved:false` with a 200:
 * previewing is a convenience, never a submission blocker. */
export interface ReferenceLookupData {
	resolved: boolean;
	source: string;
	externalId: string;
	title?: string | null;
	authors?: string[];
	year?: number | null;
	oaUrl?: string | null;
	citationCount?: number | null;
	[key: string]: unknown;
}
/** `GET /taxonomy/lookup` — the canonical name↔taxId pair, retrieved from
 * NCBI Taxonomy (SPD retrieves, it does not compute). */
export interface TaxonomyLookupData {
	query: string;
	resolved: boolean;
	taxId?: number | null;
	scientificName?: string | null;
	rank?: string | null;
	commonName?: string | null;
	[key: string]: unknown;
}

// ---------- records / community ----------
export interface ApiRecordRow {
	id: string;
	entityType: string;
	payload: unknown;
	status: string;
	createdAt?: number;
	updatedAt?: number;
	[key: string]: unknown;
}
export interface SearchHit extends ApiRecordRow {}
export interface SearchBody {
	q?: string;
	entityType?: string;
	limit?: number;
}

// ---------- federated external search ----------
/** The catalogs SPD can federate with. Each narrows one SPD entity kind:
 * UniProt → protein, PDB → pdb-entry, NCBI Gene → gene,
 * Cellosaurus → cell-line, PubChem → reagent, Rhea → reaction,
 * Reactome → pathway, BRENDA → enzyme. */
export type ExternalSource =
	'uniprot' | 'pdb' | 'ncbi' | 'cellosaurus' | 'pubchem' | 'rhea' | 'reactome' | 'brenda';
export interface ExternalHit {
	source: ExternalSource;
	externalId: string;
	title: string;
	subtitle?: string | null;
	url?: string | null;
}
/** `GET /external/search` — one source's answer. `degraded:true` means the
 * upstream was unreachable; the other sources still answer normally. */
export interface ExternalSearchData {
	source: ExternalSource;
	items: ExternalHit[];
	degraded: boolean;
	reason?: string | null;
}
/** `POST /external/import` — the materialised SPD record (or the existing one,
 * with `created:false`). `route` is the page to open after importing. */
export interface ProteinResolveResult {
	accession: string;
	uniprotAccession: string;
	publicId: string;
	entityType: string;
	route: string;
	created: boolean;
}
export interface ExternalImportResult {
	source: ExternalSource;
	externalId: string;
	publicId: string;
	entityType: string;
	route: string;
	created: boolean;
}
/** `GET /external/ladder` — the ordered upstream ladder per entity type: the
 *  dedicated catalog first, then the same-domain fallback(s). `importSources`
 *  is the subset whose import lands on this type (a rung may supply another:
 *  NCBI is a protein rung and imports a gene), so it is what a graph root's
 *  `source` field may hold. */
export interface ExternalLadderData {
	ladders: Array<{ entityType: string; sources: ExternalSource[]; importSources?: ExternalSource[] }>;
}
/** One rung of `POST /external/resolve`: one source's answer. `degraded:true`
 *  means the source was unreachable — deliberately distinct from an empty rung. */
export interface ExternalResolveRung {
	source: ExternalSource;
	degraded: boolean;
	items: ExternalResolveItem[];
}
export interface ExternalResolveItem {
	source: ExternalSource;
	externalId: string;
	title: string;
	subtitle?: string | null;
	url?: string | null;
	/** non-null when this upstream record already exists in SPD */
	localPublicId?: string | null;
	localRoute?: string | null;
}
/** `POST /external/resolve` — read-only; nothing is imported until the caller
 *  confirms a candidate. */
export interface ExternalResolveData {
	entityType: string;
	rungs: ExternalResolveRung[];
}

// ---------- personal workspace (/my) ----------
export interface MySubmission {
	id: string;
	entityType: string;
	title: string;
	createdAt: number;
	/** lifecycle state where the table keeps one; null means "on file" */
	status?: string | null;
}
export interface MyReviewItem {
	id: string;
	entityType: string;
	title: string;
	status: string;
	updatedAt: number;
	targetFoldId?: string;
}
export interface MyActionItem {
	id: string;
	entityType: string;
	status: string;
	validationType: string;
	targetFoldId: string;
	revisionNumber: number;
	updatedAt: number;
}
export interface MyWikiEdit {
	id: string;
	entityType: string;
	entityId: string;
	title: string;
	revisionNumber: number;
	updatedAt: number;
}
export interface MyActivity {
	submissions: MySubmission[];
	/** batch-landed catalog rows; server-owned, never "my submissions" */
	imports: MySubmission[];
	needsAction: MyActionItem[];
	inReview: MyReviewItem[];
	wikiEdits: MyWikiEdit[];
}

// ---------- factor & stats ----------
export interface SpdFactorData {
	userId?: string;
	orcidId?: string;
	displayName?: string;
	factor: { total: number; byType: Record<string, number> };
	accepted?: unknown[];
	pending?: unknown[];
	acceptedCount?: number;
	pendingCount?: number;
	[key: string]: unknown;
}
export interface LeaderboardItem {
	userId: string;
	orcidId: string;
	displayName?: string | null;
	factor: number;
	validationCount: number;
	[key: string]: unknown;
}
export interface LeaderboardData {
	leaderboard?: LeaderboardItem[];
	[key: string]: unknown;
}

export interface StatsOverview {
	counts: Record<string, number>;
}
export interface TrendingItem {
	entityType: string;
	entityId: string;
	/** Current API field. */
	queries?: number;
	/** Pre-rename field; kept so older payloads still render a number. */
	count?: number;
}
export interface TrendingData {
	items?: TrendingItem[];
	entityType?: string | null;
	days?: number;
	[key: string]: unknown;
}
export interface MatchRateBucket {
	/** Current API field for the period label; older payloads used `bucket`. */
	period?: string;
	bucket?: string;
	total?: number;
	matches?: number;
	matchRate?: number;
	rate?: number;
	[key: string]: unknown;
}
export interface MatchRateData {
	trend?: MatchRateBucket[];
	buckets?: MatchRateBucket[];
	overall?: { total?: number; matches?: number; matchRate?: number; rate?: number };
	[key: string]: unknown;
}
export interface EnvPreferenceBucket {
	/** Current API field; older payloads used `bucket`. */
	range?: string;
	bucket?: string;
	count: number;
}
export interface EnvPreferencesData {
	phRanges?: EnvPreferenceBucket[];
	temperatureRanges?: EnvPreferenceBucket[];
	ph?: EnvPreferenceBucket[];
	temperature?: EnvPreferenceBucket[];
	phBuckets?: EnvPreferenceBucket[];
	temperatureBuckets?: EnvPreferenceBucket[];
	[key: string]: unknown;
}

// ---------- storage receipts ----------
export interface UploadReceipt {
	ok: boolean;
	objectKey: string;
	size: number;
	sha256: string;
}
export interface ArtifactCreateReceipt {
	artifactId: string;
	created: boolean;
	status: string;
}
export interface ArtifactCompleteReceipt {
	artifactId: string;
	status: string;
	completedAt: number;
}

/** loose JSON object for free-form columns */
export type JsonValue = unknown;
export type JsonObject = Record<string, unknown>;

// ---------- universal API tokens (§40) ----------
export type ApiTokenInput = S['ApiTokenInput'];
export type TokenTierInput = S['TokenTierInput'];
export interface ApiTokenRow {
	tokenId: string;
	name: string;
	prefix: string;
	createdAt: number;
	expiresAt?: number | null;
	lastUsedAt?: number | null;
	revoked: boolean;
	revokedAt?: number | null;
	revokeReason?: string | null;
	[key: string]: unknown;
}
export interface ApiTokenMintReceipt {
	tokenId: string;
	name: string;
	tier: string;
	token: string;
	createdAt: number;
	expiresAt?: number | null;
	[key: string]: unknown;
}

// ---------- graph query DSL (§41) ----------
export type GraphQueryInput = S['GraphQueryInput'];
export type RootRef = S['RootRef'];
export type NodeQuery = S['NodeQuery'];
export interface GraphQueryData {
	results: unknown;
	tier: string;
	budgetMax: number;
	budgetUsed: number;
	[key: string]: unknown;
}

// ---------- provenance snapshots (§43) ----------
export type SnapshotInput = S['SnapshotInput'];
export interface ProvenanceSnapshotRow {
	snapshotId?: string;
	id?: string;
	entityType: string;
	entityId: string;
	source: string;
	sourceId: string;
	objectKey?: string;
	sha256: string;
	byteLength: number;
	mediaType: string;
	fetchedAt: number;
	createdAt: number;
	[key: string]: unknown;
}
export type ProvenanceReceipt = ProvenanceSnapshotRow;

// ---------- PDB entry catalog (§44) ----------
export type PdbEntryInput = S['PdbEntryInput'];
export interface PdbEntryRow {
	id?: string;
	publicId?: string;
	pdbId: string;
	title: string;
	experimentalMethod: string;
	resolutionAngstrom?: number | null;
	releasedAt?: number | null;
	uniprotAccessions?: string[];
	entryMetadata?: unknown;
	metadata?: unknown;
	coordinatesArtifactId?: string | null;
	sourceUpdatedAt?: number | null;
	spaceGroup?: string | null;
	cell?: { a?: number; b?: number; c?: number; alpha?: number; beta?: number; gamma?: number };
	rFactorWork?: number | null;
	rFree?: number | null;
	assemblyCount?: number | null;
	citation?: { title?: string; journal?: string; year?: number; doi?: string } | null;
	createdBy?: string;
	createdAt?: number;
	updatedAt?: number;
	[key: string]: unknown;
}

export interface ProteinAnnotationRecord {
	id: string;
	sequenceId: string;
	featureType: string;
	startPosition: number | null;
	endPosition: number | null;
	residue?: string | null;
	description: string;
	evidenceText?: string | null;
	externalSource?: string | null;
	externalId?: string | null;
	evidence: { source: string; id: string }[];
	license: string;
	createdAt: number;
}

export interface ProteinAnnotationsData {
	proteinId: string;
	sequenceId?: string;
	annotations: ProteinAnnotationRecord[];
	created?: number;
	duplicates?: number;
}

export interface SequenceAnnotationsData {
	sequenceId: string;
	annotations: ProteinAnnotationRecord[];
}

export interface PdbEntityRecord {
	pdbEntryId: string;
	entityId: number;
	entityKind: string;
	polymerType?: string | null;
	description: string;
	chainNames: string[];
	residueCount?: number | null;
	sequence?: string | null;
	sequenceSha256?: string | null;
	proteinSequenceId?: string | null;
	uniprotAccessions: string[];
	compIds: string[];
	createdAt: number;
	updatedAt: number;
}

export interface PdbEntitiesData {
	pdbId: string;
	entities: PdbEntityRecord[];
}

// ---------- peer review dispatch (§46) ----------
export interface PeerAssignmentItem {
	id: string;
	entityType: 'wet_lab_validation' | 'protocol' | string;
	entityId: string;
	revisionNumber?: number | null;
	organizationId: string;
	reviewerUserId: string;
	status: 'open' | 'fulfilled' | 'expired' | 'cancelled' | 'declined' | string;
	storedStatus: string;
	fulfilled: boolean;
	createdAt: number;
	reminderNotifiedAt?: number | null;
	expiredAt?: number | null;
	cancelledAt?: number | null;
	cancelReason?: string | null;
	// 0032 review rounds: the dispatch belongs to one round; dueAt is the
	// explicit deadline the cron reminds on and expires at; a decline is a
	// recorded act (declinedAt + optional reason), not an expiry.
	round: number;
	dueAt?: number | null;
	declinedAt?: number | null;
	declineReason?: string | null;
	// earliest qualifying review (the reviewer's own turnaround, so the
	// workbench median is a real number, not a count alone — 0032).
	fulfilledAt?: number | null;
}

/** One editorial decision row (0032). `letter` rides along only on private
 *  reads (submitter/staff); public reads omit it entirely. */
export interface EditorialDecisionRecordLite {
	id: string;
	round: number;
	revisionNumber: number;
	decision: 'accept' | 'minor_revision' | 'major_revision' | 'decline' | string;
	editorId?: string | null;
	editorDisplayName?: string | null;
	system: boolean;
	createdAt: number;
	letter?: string | null;
}

/** Editorial discussion message (0032): internal rows are staff-only — the
 *  server filters them in SQL, so a non-staff read simply never contains one. */
export interface EditorialMessageRecord {
	id: string;
	taskId?: string | null;
	authorUserId: string;
	authorDisplayName?: string | null;
	body: string;
	visibility: 'internal' | 'with_author';
	createdAt: number;
}

/** Staff projection of a published review: the public ReviewRecord keys plus
 *  the editor-only note lane. */
export type StaffReviewRecord = ReviewRecord & { confidentialComment?: string | null };

/** GET /admin/editorial-stats envelope (bounded recency windows; the payload
 *  states its own caps, see the backend's §10.13). */
export interface AdminEditorialStats {
	generatedAt: number;
	backlog: {
		validationsByStatus: Record<string, number>;
		protocolsByStatus: Record<string, number>;
		awaitingDecision: number;
		oldestAwaitingDays: number | null;
		awaitingRecords: Array<{
			entityType: string;
			id: string;
			round: number;
			reviewCount: number;
			submittedAt: number;
		}>;
	};
	screening: { medianFirstScreeningDays: number | null; resolvedTaskCount: number };
	reviewing: {
		medianReviewDays: number | null;
		onTimeRatePercent: number | null;
		fulfilledPairs: number;
	};
	decisions: Record<string, number>;
	reviewers: { activeLast90d: number; dispatchesByStatus: Record<string, number> };
	windows: { ledgerRows: number; pairs: number; note: string };
}

/** GET /admin/reviewers roster row (per-reviewer performance, round-aware). */
export interface AdminReviewerRow {
	reviewerId: string;
	displayName?: string | null;
	publishedReviews: number;
	fulfilledDispatches: number;
	openDispatches: number;
	declinedDispatches: number;
	expiredDispatches: number;
	medianReviewDays: number | null;
	onTimeRatePercent: number | null;
	lastActiveAt: number | null;
}
export interface PeerSeat {
	id: string;
	organizationId: string;
	organizationName: string;
	status: 'invited' | 'active' | string;
	invitedAt: number;
	acceptedAt?: number | null;
}
export interface PeerAssignmentsData {
	items: PeerAssignmentItem[];
	seats: PeerSeat[];
	target: number;
}
export interface PeerPoolSeat {
	id: string;
	userId: string;
	orcid: string;
	displayName?: string | null;
	status: 'invited' | 'active' | string;
	invitedAt: number;
	acceptedAt?: number | null;
}

// ------------------------------------- entity identity (relations / xrefs) ----

/** One endpoint of a relation. Types are wire-spelled (`pdb-entry`,
 *  `restriction-enzyme`); ids are SPD public ids. */
export interface EntityRef {
	type: string;
	id: string;
}

/** Relation direction is relative to the entity that was queried. */
export type RelationDirection = 'in' | 'out';

/** `GET /entities/{type}/{id}/relations` — both directions by default. */
export interface EntityRelation {
	id: string;
	relationType: string;
	role?: string | null;
	direction: RelationDirection;
	/** `derived` when the backend inferred the edge; otherwise the stored source. */
	source: string;
	from: EntityRef;
	to: EntityRef;
	note?: string | null;
}

export interface EntityRelationsData {
	entity: EntityRef;
	relations: EntityRelation[];
}

/** `GET /entities/{type}/{id}/external-ids` — upstream accession plate. */
export interface ExternalIdentifierRow {
	id: string;
	source: string;
	externalId: string;
	url?: string | null;
	primary?: boolean;
}

export interface ImportProvenance {
	system: boolean;
	source: string;
	externalId: string;
	sourceUrl?: string | null;
	fetchedAt?: number | null;
	license?: string | null;
}

export interface EntityExternalIdentifiersData {
	entityId: string;
	identifiers: ExternalIdentifierRow[];
	/** present when the row was materialised by the federation import door */
	importProvenance?: ImportProvenance | null;
}
