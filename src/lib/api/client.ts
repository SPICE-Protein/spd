/**
 * Full endpoint surface of the SPD API (FEATURE_LIST §36), grouped by module.
 *
 * Request-key casing follows the GENERATED schema (`src/lib/api/schema.d.ts`),
 * which mirrors the backend DTOs byte-for-byte. Most bodies are camelCase; the
 * noted exceptions (codon, mutation-set, observed-structure, assemble, records,
 * artifact, preflight, analysis, comment/assessment extras) are snake_case on
 * the wire exactly as the backend serializes them.
 *
 * Read helpers: `request` unwraps the `{data,meta,error}` envelope automatically;
 * bare write receipts pass through untouched. Free-form catalog payloads are
 * typed loosely — consumers use `firstArray()` to survive container-name
 * differences between modules.
 */
import {
	BASE_URL,
	API_PREFIX,
	get,
	post,
	put,
	patch,
	del,
	request,
	requestEnvelope,
	uploadBytes,
	hashArtifact
} from './base';
import type {
	AdminApplicationRow,
	AdminAuditRow,
	AdminClaimRow,
	AdminCommentRow,
	AdminDecisionReceipt,
	AdminEditorialStats,
	AdminRecordRow,
	AdminReviewerRow,
	AdminUserRow,
	ApiRecordRow,
	ApiTokenInput,
	ApiTokenMintReceipt,
	ApiTokenRow,
	ArtifactCompleteReceipt,
	ArtifactCreateReceipt,
	ArtifactInput,
	ArtifactRecord,
	AssessmentInput,
	BiobrickRow,
	CanonicalAssessmentRecord,
	CassetteRow,
	CellLineRow,
	CodonUsageRow,
	GeneticCodeRow,
	GeneticCodeSpeciesBinding,
	SpeciesGeneticCodeData,
	CommentInput,
	CommentRecord,
	ComparisonRow,
	ConditionTemplateRow,
	ConstructRow,
	EditorialDecisionRecordLite,
	EditorialMessageRecord,
	EntityExternalIdentifiersData,
	EntityRefreshApplyData,
	EntityRefreshData,
	EntityRefreshDismissData,
	EntityRelationsData,
	EnvPreferencesData,
	EnvironmentInput,
	EnvironmentRecord,
	EnzymeBrendaFetch,
	EnzymeDetail,
	EnzymeSpeciesDataInput,
	ExternalImportResult,
	ExternalSearchData,
	ExternalSource,
	FoldArtifactsData,
	FoldHistoryData,
	FoldInput,
	FoldRecord,
	GeneListRow,
	GeneRecord,
	GeneRegionsData,
	GeneSourceRefreshData,
	GeneSourceRefreshProposal,
	StructureCandidateDecisionReceipt,
	SequenceMutationMapData,
	SequenceStructureCandidatesData,
	GraphQueryData,
	GraphQueryInput,
	InteractionRow,
	LeaderboardData,
	MatchRateData,
	MeasurementRow,
	MediaRecipeRow,
	ModelInput,
	ModelRecord,
	MutationEffectAggregate,
	MutationEffectRow,
	MutationSetRow,
	MyActionItem,
	MyReviewItem,
	MySubmission,
	MyWikiEdit,
	ObservedStructureRecord,
	OrganizationHome,
	PathwayRow,
	PathwayStepRow,
	PdbEntitiesData,
	PdbEntryInput,
	PdbEntryRow,
	PeerAssignmentItem,
	PeerAssignmentsData,
	PeerPoolSeat,
	PocketAnalysisRecord,
	PreflightResponse,
	ProteinAnnotationsData,
	ProteinCreateReceipt,
	ProteinInput,
	ProteinRecord,
	ProteinResolveResult,
	ProvenanceReceipt,
	ProvenanceSnapshotRow,
	ReactionRow,
	ReagentRow,
	ReferenceLookupData,
	ReferenceRefreshData,
	RestrictionEnzymeDetail,
	ReviewInput,
	ReviewRecord,
	RevisionRecord,
	SearchBody,
	SearchHit,
	SequenceAnnotationsData,
	SequenceCreateReceipt,
	SequenceInput,
	SequenceLineageData,
	SequenceStabilityDomainData,
	SequenceStructuresData,
	SequenceRecord,
	SequenceTreeData,
	SessionData,
	SnapshotInput,
	SpdFactorData,
	StabilityScanRecord,
	StatsOverview,
	StrainRow,
	SupplierInput,
	TaxonomyLookupData,
	TokenTierInput,
	TrendingData,
	ValidationInput,
	ValidationRecord,
	VectorDetail,
	VectorRow
} from './types';

// ---------------------------------------------------------------- helpers ----

/**
 * Catalog list endpoints wrap rows under varying keys (`items`, `enzymes`, …)
 * or return a bare array. Find the first array property defensively.
 */
export function firstArray<T>(data: unknown, ...preferred: string[]): T[] {
	if (Array.isArray(data)) return data as T[];
	if (data && typeof data === 'object') {
		const obj = data as Record<string, unknown>;
		for (const key of preferred) {
			if (Array.isArray(obj[key])) return obj[key] as T[];
		}
		for (const value of Object.values(obj)) {
			if (Array.isArray(value)) return value as T[];
		}
	}
	return [];
}

export function pick<T>(data: unknown, key: string): T | undefined {
	if (data && typeof data === 'object' && !Array.isArray(data)) {
		return (data as Record<string, unknown>)[key] as T | undefined;
	}
	return undefined;
}

// ------------------------------------------------------------------ auth ----

export const auth = {
	/** Browser navigation target (server-side 302 through ORCID). */
	loginUrl: () => `${BASE_URL}/api/v1/auth/orcid`,
	me: () => get<SessionData>('/user/me'),
	activity: () =>
		get<{
			submissions?: MySubmission[];
			imports?: MySubmission[];
			needsAction?: MyActionItem[];
			inReview?: MyReviewItem[];
			wikiEdits?: MyWikiEdit[];
		}>('/user/me/activity'),
	/** One-time migration of pre-0057 browser import marks. */
	claimImports: (ids: string[]) => post<{ claimed: number }>('/user/me/imports/claim', { ids }),
	logout: () => post<{ ok: boolean }>('/user/logout'),
	logoutAll: () => post<{ ok: boolean }>('/user/logout-all')
};

// ------------------------------------------------- researcher applications ----

export const researcherApplications = {
	list: () => get<{ applications?: unknown[] }>('/user/me/researcher-application'),
	create: (body: {
		institutionName: string;
		department?: string;
		position?: string;
		institutionEmail?: string;
		organizationVerificationId?: string;
		researchPurpose: string;
	}) =>
		post<{
			applicationId: string;
			status: string;
			verification: { channel: string; address: string | null; instructions: string };
		}>('/user/me/researcher-application', body)
};

// ------------------------------------------------------- proteins & seqs ----

/** Many GET /:id handlers wrap the record under a module key ({"protein":…}
 * etc.). Pages read records flat — unwrap here and merge top-level extras
 * (suppliers/vectors/reviews/steps/members) onto the record. Flat
 * projections pass through untouched, so this is safe for every module. */
function unwrap<T>(key: string) {
	return (d: T): T => {
		if (d && typeof d === 'object' && !Array.isArray(d)) {
			const o = d as Record<string, unknown>;
			const core = o[key];
			if (core && typeof core === 'object' && !Array.isArray(core)) {
				// drop the wrapper key itself, otherwise pages re-render the whole
				// record twice (flat fields + a duplicate nested block)
				const { [key]: _drop, ...extras } = o;
				return { ...extras, ...(core as Record<string, unknown>) } as T;
			}
		}
		return d;
	};
}

export const proteins = {
	list: (limit?: number) =>
		get<{ items: ProteinRecord[]; page: number; pageSize: number; count?: number }>('/proteins', {
			limit
		}),
	get: (id: string) => get<ProteinRecord>(`/proteins/${id}`).then(unwrap('protein')),
	create: (body: ProteinInput) => post<ProteinCreateReceipt>('/proteins', body),
	/** UniProt-style feature rows over the canonical sequence (0034). */
	annotations: (id: string) => get<ProteinAnnotationsData>(`/proteins/${id}/annotations`),
	createAnnotations: (
		id: string,
		body: { sequenceId?: string; annotations: Array<Record<string, unknown>> }
	) => post<ProteinAnnotationsData>(`/proteins/${id}/annotations`, body)
};

export const sequences = {
	get: (id: string) => get<SequenceRecord>(`/sequences/${id}`).then(unwrap('sequence')),
	create: (body: SequenceInput) => post<SequenceCreateReceipt>('/sequences', body),
	annotations: (id: string) => get<SequenceAnnotationsData>(`/sequences/${id}/annotations`),
	lineage: (id: string) => get<SequenceLineageData>(`/sequences/${id}/lineage`),
	tree: (id: string) => get<SequenceTreeData>(`/sequences/${id}/tree`),
	mutationEffects: (id: string) =>
		request<MutationEffectAggregate[]>(`/sequences/${id}/mutation-effects`),
	/** Exact-match PDB structures, ordered by the primary-structure rule. */
	structures: (id: string) => get<SequenceStructuresData>(`/sequences/${id}/structures`),
	/** Candidate PDB chains linked through a shared UniProt accession, awaiting
	 * or carrying an explicit human confirm/reject decision. */
	structureCandidates: (id: string) =>
		get<SequenceStructureCandidatesData>(`/sequences/${id}/structure-candidates`),
	decideStructureCandidate: (
		id: string,
		pdbId: string,
		entityId: number,
		body: { decision: 'confirmed' | 'rejected'; note?: string }
	) =>
		put<StructureCandidateDecisionReceipt>(
			`/sequences/${id}/structure-candidates/${pdbId}/${entityId}`,
			body
		),
	clearStructureCandidate: (id: string, pdbId: string, entityId: number) =>
		del<StructureCandidateDecisionReceipt>(
			`/sequences/${id}/structure-candidates/${pdbId}/${entityId}`
		),
	/** Declared mutations joined to overlapping annotations, measured effects and
	 * exact-match structure availability. */
	mutationMap: (id: string) => get<SequenceMutationMapData>(`/sequences/${id}/mutation-map`),
	/** Newest engine stability scan across this sequence's folds. */
	stabilityDomain: (id: string) =>
		get<SequenceStabilityDomainData>(`/sequences/${id}/stability-domain`)
};

// --------------------------------------------------- environment/model ----

export const environments = {
	create: (body: EnvironmentInput) =>
		post<{ id: string; environmentSha256?: string; created: boolean; deduplicated?: boolean }>(
			'/environments',
			body
		),
	get: (id: string) => get<EnvironmentRecord>(`/environments/${id}`).then(unwrap('environment'))
};

export const models = {
	create: (body: ModelInput) =>
		post<{ id: string; identitySha256?: string; created: boolean; deduplicated?: boolean }>(
			'/models',
			body
		),
	get: (id: string) => get<ModelRecord>(`/models/${id}`).then(unwrap('model'))
};

// -------------------------------------------------------------- folds ----

export const folds = {
	create: (body: FoldInput) =>
		post<{
			fold: FoldRecord;
			created: boolean;
			deduplicated?: boolean;
			verificationLevel?: string;
		}>('/folds', body),
	get: (id: string) => get<FoldRecord>(`/folds/${id}`).then(unwrap('fold')),
	query: (body: {
		sequenceId?: string;
		environmentId?: string;
		modelIdentityId?: string;
		foldIdentityHash?: string;
		limit?: number;
	}) => post<unknown>('/folds/query', body),
	artifacts: (id: string) => get<FoldArtifactsData>(`/folds/${id}/artifacts`),
	appendArtifacts: (id: string, artifactIds: string[]) =>
		post<FoldArtifactsData>(`/folds/${id}/artifacts`, { artifactIds }),
	history: (id: string) => get<FoldHistoryData>(`/folds/${id}/history`),
	assessment: (id: string) =>
		get<{ current: CanonicalAssessmentRecord | null; assessments: CanonicalAssessmentRecord[] }>(
			`/folds/${id}/assessment`
		),
	postAssessment: (id: string, body: AssessmentInput) =>
		post<{ id: string; created: boolean; confidenceModel?: string }>(
			'/folds/' + id + '/assessment',
			body
		),
	recalculate: (id: string) =>
		post<{ id: string; created: boolean; confidenceModel?: string }>(
			`/folds/${id}/recalculate-assessment`,
			{}
		),
	stabilityDomain: (id: string) => get<StabilityScanRecord | null>(`/folds/${id}/stability-domain`),
	/** AnalysisInput is snake-case on the wire: {engine?, request?, result?, artifact_ids?, provenance?} etc. */
	mdVerifications: (id: string, body: Record<string, unknown>) =>
		post<{ id: string; created: boolean; verificationLevel: string; qualityLabels: string[] }>(
			`/folds/${id}/md-verifications`,
			body
		),
	stabilityScans: (id: string, body: Record<string, unknown>) =>
		post<{ id: string; created: boolean; verificationLevel: string; qualityLabels: string[] }>(
			`/folds/${id}/stability-scans`,
			body
		),
	pocketAnalyses: (id: string, body: Record<string, unknown>) =>
		post<{ id: string; created: boolean; verificationLevel: string; qualityLabels: string[] }>(
			`/folds/${id}/pocket-analyses`,
			body
		),
	observedStructures: (
		id: string,
		body: {
			method: string;
			coordinates_artifact_id: string;
			quality?: unknown;
			environment?: unknown;
			comparison?: unknown;
		}
	) => post<{ id: string; created: boolean }>(`/folds/${id}/observed-structures`, body),
	interactions: (id: string) => request<unknown>(`/folds/${id}/interactions`),
	comparisons: (id: string) => request<unknown>(`/folds/${id}/comparisons`)
};

// ---------------------------------------------------------- validations ----

export const validations = {
	submit: (foldId: string, body: ValidationInput) =>
		post<{ validationId: string; targetFoldId: string; status: string }>(
			`/folds/${foldId}/validations`,
			body
		),
	get: (id: string) =>
		get<{
			validation: ValidationRecord;
			reviews: unknown[];
			screeningEvents: unknown[];
			// 0032: the ledger rides along on every detail read (letters only
			// when the viewer is submitter/staff — the server decides).
			decisions?: EditorialDecisionRecordLite[];
			currentRound?: number;
			roundClosed?: boolean;
		}>(`/validations/${id}`),
	screen: (
		id: string,
		body: { decision: 'screened' | 'needs_revision' | 'rejected_with_reason'; reason: string }
	) => post<{ validationId?: string; status: string }>(`/validations/${id}/screen`, body),
	reviews: {
		list: (id: string) =>
			get<{ validationId: string; reviews: ReviewRecord[]; summary: unknown }>(
				`/validations/${id}/reviews`
			),
		create: (id: string, body: ReviewInput) =>
			post<{ reviewId: string; validationId: string; status: string }>(
				`/validations/${id}/reviews`,
				body
			)
	},
	moderateReview: (reviewId: string, body: { action: 'invalidate' | 'restore'; reason: string }) =>
		post<{ reviewId: string; action: string }>(`/validation-reviews/${reviewId}/moderate`, body),
	// admin-only content edit: the review keeps its status, the words change
	editReview: (reviewId: string, body: { comment: string; reason: string }) =>
		post<{ reviewId: string; action: string }>(`/validation-reviews/${reviewId}/edit`, body),
	revisions: {
		list: (id: string) =>
			get<{ validationId: string; revisions: RevisionRecord[] }>(`/validations/${id}/revisions`),
		create: (id: string, body: { payload: unknown; changeSummary: string }) =>
			post<{ revision: RevisionRecord; status: string }>(`/validations/${id}/revisions`, body)
	},
	comments: {
		list: (id: string) =>
			get<{ validationId: string; comments: CommentRecord[] }>(`/validations/${id}/comments`),
		create: (id: string, body: CommentInput) =>
			post<{ commentId: string; status?: string }>(`/validations/${id}/comments`, body)
	},
	measurements: (id: string) => request<unknown>(`/validations/${id}/measurements`),
	// 0032 editorial decisions: the ledger reads through the detail GET above;
	// this pair records a verdict (staff) and fetches composer presets.
	decide: (id: string, body: { decision: string; letter?: string }) =>
		post<{
			validationId: string;
			decision: string;
			round: number;
			status: string;
			recorded: boolean;
		}>(`/validations/${id}/decisions`, body),
	decisionPresets: () =>
		get<{ decisions: Array<{ decision: string; letter: string }> }>(
			'/validations/decision-presets'
		),
	messages: {
		list: (id: string) =>
			get<{ validationId: string; messages: EditorialMessageRecord[] }>(
				`/validations/${id}/messages`
			),
		create: (id: string, body: { body: string; visibility?: 'internal' | 'with_author' }) =>
			post<{ messageId: string; visibility: string; createdAt: number }>(
				`/validations/${id}/messages`,
				body
			)
	}
};

// ----------------------------------------------------- organizations ----

export const organizations = {
	createClaim: (body: {
		name: string;
		department?: string;
		domain?: string;
		verificationEmail?: string;
		evidenceSummary: string;
		evidenceEmail?: string;
	}) => post<Record<string, unknown>>('/organizations', body),
	directory: () => get<{ organizations?: unknown[] }>('/organizations/directory'),
	myMemberships: () => get<{ organizations?: unknown[] }>('/organizations'),
	home: (id: string) => get<OrganizationHome>(`/organizations/${id}`),
	patchProfile: (id: string, patchBody: Record<string, unknown>) =>
		patch<Record<string, unknown>>(`/organizations/${id}/profile`, patchBody),
	setSponsor: (id: string, level: string) =>
		patch<Record<string, unknown>>(`/organizations/${id}/sponsor`, { level }),
	leaderboard: (id: string) => get<unknown>(`/organizations/${id}/leaderboard`),
	vectors: (id: string) => get<unknown>(`/organizations/${id}/vectors`),
	restrictionEnzymes: (id: string) => get<unknown>(`/organizations/${id}/restriction-enzymes`),
	reagents: (id: string) => get<unknown>(`/organizations/${id}/reagents`),
	materials: (id: string) => get<unknown>(`/organizations/${id}/materials`),
	researchers: (organizationId: string) =>
		get<unknown>(`/organizations/${organizationId}/researchers`),
	addResearcher: (organizationId: string, userId: string, verificationId: string) =>
		post<Record<string, unknown>>(`/organizations/${organizationId}/researchers/${userId}`, {
			organizationVerificationId: verificationId
		}),
	removeResearcher: (organizationId: string, userId: string, reason?: string) =>
		del<Record<string, unknown>>(
			`/organizations/${organizationId}/researchers/${userId}`,
			reason ? { reason } : undefined
		)
};

// ------------------------------------------------------------- admin ----

export const admin = {
	approveApplication: (id: string, expiresInDays?: number, note?: string) =>
		post<AdminDecisionReceipt>(`/admin/researcher-applications/${id}/approve`, {
			expiresInDays,
			note
		}),
	rejectApplication: (id: string, note?: string) =>
		post<AdminDecisionReceipt>(`/admin/researcher-applications/${id}/reject`, { note }),
	markEmailReceived: (
		id: string,
		body: { senderEmail: string; recipientEmail: string; messageId?: string; subject?: string }
	) => post<AdminDecisionReceipt>(`/admin/researcher-applications/${id}/email-received`, body),
	approveClaim: (id: string, note?: string) =>
		post<AdminDecisionReceipt>(`/admin/organization-claims/${id}/approve`, { note }),
	rejectClaim: (id: string, note?: string) =>
		post<AdminDecisionReceipt>(`/admin/organization-claims/${id}/reject`, { note }),
	// wire query keys are snake_case (TaskListQuery has no rename_all)
	tasks: (filter?: { status?: string; taskType?: string; assignee?: string }) => {
		const q: Record<string, string> = {};
		if (filter?.status) q.status = filter.status;
		if (filter?.taskType) q.task_type = filter.taskType;
		if (filter?.assignee) q.assigned_to = filter.assignee;
		return get<unknown>('/admin/tasks', Object.keys(q).length ? q : undefined);
	},
	applications: (status?: string) =>
		get<{ applications: AdminApplicationRow[]; asOf: number }>(
			'/admin/researcher-applications',
			status ? { status } : undefined
		),
	claims: (status?: string) =>
		get<{ claims: AdminClaimRow[]; asOf: number }>(
			'/admin/organization-claims',
			status ? { status } : undefined
		),
	audit: (filter?: { resourceType?: string; resourceId?: string }) => {
		const q: Record<string, string> = {};
		if (filter?.resourceType) q.resource_type = filter.resourceType;
		if (filter?.resourceId) q.resource_id = filter.resourceId;
		return get<{ entries: AdminAuditRow[]; asOf: number }>(
			'/admin/audit',
			Object.keys(q).length ? q : undefined
		);
	},
	task: (id: string) => get<Record<string, unknown>>(`/admin/tasks/${id}`),
	claimTask: (id: string) => post<Record<string, unknown>>(`/admin/tasks/${id}/claim`, {}),
	reassignTask: (id: string, assigneeId: string) =>
		post<Record<string, unknown>>(`/admin/tasks/${id}/reassign`, { assigneeId }),
	resolveTask: (id: string, resolution?: string) =>
		post<Record<string, unknown>>(`/admin/tasks/${id}/resolve`, { resolution }),
	cancelTask: (id: string, reason?: string) =>
		post<Record<string, unknown>>(`/admin/tasks/${id}/cancel`, { reason }),
	// Community filings moderation (corrections / retractions / contributions —
	// the mechanism covers every api_records kind; the UI scopes the buttons).
	// Wire query keys are snake_case (RecordListQuery has no rename_all).
	records: (filter?: { entityType?: string; hidden?: boolean; limit?: number }) => {
		const q: Record<string, string> = {};
		if (filter?.entityType) q.entity_type = filter.entityType;
		if (filter?.hidden !== undefined) q.hidden = filter.hidden ? '1' : '0';
		if (filter?.limit) q.limit = String(filter.limit);
		return get<{ items: AdminRecordRow[] }>(
			'/admin/records',
			Object.keys(q).length ? q : undefined
		);
	},
	// Editing must not create an invalid filing shape — the server re-validates.
	// Soft delete only: hidden rows vanish from public reads, stay here, and
	// every action carries a reason that lands in the audit trail.
	editRecord: (id: string, body: { payload: unknown; reason: string }) =>
		post<{ id: string; updated: boolean }>(`/admin/records/${id}/edit`, body),
	hideRecord: (id: string, reason: string) =>
		post<{ id: string; hidden: boolean }>(`/admin/records/${id}/hide`, { reason }),
	restoreRecord: (id: string, reason: string) =>
		post<{ id: string; hidden: boolean }>(`/admin/records/${id}/restore`, { reason }),
	// Accept a correction: the field assertions run through the create
	// path's own gates and land on the target record; the receipt carries
	// the before/after `changed` and the advisory `drifted` lists (§53).
	// Staff may edit the proposed values before accepting: passing `items`
	// overrides the filed assertions for THIS apply only — the ledger payload
	// stays exactly as the contributor wrote it, and the audit records both
	// the override flag and the effective values.
	applyRecord: (id: string, reason: string, items?: Array<Record<string, unknown>>) =>
		post<{ id: string; status: string; changed?: unknown[]; drifted?: unknown[] }>(
			`/admin/records/${id}/apply`,
			items ? { reason, items } : { reason }
		),
	// Editorial-office correction: the ledger row and its application happen
	// in one call, so there is no contributor filing to accept afterwards.
	officialCorrection: (body: {
		targetId: string;
		entityType?: string;
		reason: string;
		items: Array<Record<string, unknown>>;
	}) =>
		post<{ id: string; status: string; changed?: unknown[]; drifted?: unknown[] }>(
			'/admin/corrections',
			body
		),
	rejectRecord: (id: string, reason: string) =>
		post<{ id: string; status: string }>(`/admin/records/${id}/reject`, { reason }),
	// One thread's full comment list for staff — moderated rows included, so
	// a hide can be undone later. Wire query keys are snake_case.
	comments: (filter: { entityType: string; entityId: string }) =>
		get<{ items: AdminCommentRow[] }>('/admin/comments', {
			entity_type: filter.entityType,
			entity_id: filter.entityId
		}),
	// Wiki comment threads: same soft-delete discipline; 'edited' rows keep a badge
	editComment: (id: string, body: { body: string; reason: string }) =>
		post<{ id: string; status: string }>(`/admin/comments/${id}/edit`, body),
	hideComment: (id: string, reason: string) =>
		post<{ id: string; hidden: boolean }>(`/admin/comments/${id}/hide`, { reason }),
	restoreComment: (id: string, reason: string) =>
		post<{ id: string; hidden: boolean }>(`/admin/comments/${id}/restore`, { reason }),
	user: (userId: string) => get<AdminUserRow>(`/admin/users/${userId}`),
	grantRole: (userId: string, body: { role: string; expiresInDays?: number; reason?: string }) =>
		post<Record<string, unknown>>(`/admin/users/${userId}/roles`, body),
	revokeRole: (userId: string, role: string) =>
		del<Record<string, unknown>>(`/admin/users/${userId}/roles/${role}`),
	// peer dispatch queue (§46): wire query keys are camelCase here
	peerDispatches: (filter?: {
		status?: string;
		entityType?: string;
		entityId?: string;
		organizationId?: string;
	}) => {
		const q: Record<string, string> = {};
		if (filter?.status) q.status = filter.status;
		if (filter?.entityType) q.entityType = filter.entityType;
		if (filter?.entityId) q.entityId = filter.entityId;
		if (filter?.organizationId) q.organizationId = filter.organizationId;
		return get<{ items: PeerAssignmentItem[]; target: number }>(
			'/admin/peer-dispatches',
			Object.keys(q).length ? q : undefined
		);
	},
	// dueDays (0032) sets the explicit deadline the reviewer is reminded and
	// expired on; omitted = the server's default (created + 14d).
	manualDispatch: (body: {
		entityType: string;
		entityId: string;
		reviewerOrcidId: string;
		dueDays?: number;
	}) => post<PeerAssignmentItem>('/admin/peer-dispatches', body),
	cancelDispatch: (id: string) =>
		post<Record<string, unknown>>(`/admin/peer-dispatches/${id}/cancel`, {}),
	editorialStats: () => get<AdminEditorialStats>('/admin/editorial-stats'),
	reviewerRoster: () => get<{ reviewers: AdminReviewerRow[] }>('/admin/reviewers'),
	// 0032 staff roster for pickers: names, not uuids to paste
	staff: () => get<unknown>('/admin/staff'),
	setDispatchQuota: (orgId: string, year: number, quota: number) =>
		post<{ organizationId: string; year: number; quota: number }>(
			`/admin/organizations/${orgId}/dispatch-quotas/${year}`,
			{ quota }
		),
	deleteDispatchQuota: (orgId: string, year: number) =>
		del<{ organizationId: string; year: number; removed: boolean }>(
			`/admin/organizations/${orgId}/dispatch-quotas/${year}`
		)
};

// -------------------------------------------------------- peer review ------

/** Org-leader pool management + the signed-in reviewer's own workbench. */
export const peers = {
	assignments: () => get<PeerAssignmentsData>('/peer-assignments'),
	// 0032: a reviewer says "no" as an act — open → declined with a reason,
	// excluded for the rest of the round, re-askable in a later round.
	decline: (id: string, reason?: string) =>
		post<{ id: string; status: string; declinedAt: number }>(`/peer-dispatches/${id}/decline`, {
			reason
		}),
	pool: (orgId: string) => get<{ seats: PeerPoolSeat[] }>(`/organizations/${orgId}/peers`),
	nominate: (orgId: string, orcidId: string) =>
		post<{ id: string; invited: boolean }>(`/organizations/${orgId}/peers/nominate`, { orcidId }),
	remove: (orgId: string, memberId: string, reason?: string) =>
		del<{ id: string; removed: boolean }>(`/organizations/${orgId}/peers/${memberId}`, { reason })
};

// --------------------------------------------------- uploads/artifacts ----

export const uploads = {
	preflight: (body: { object_key: string; content_type: string; size: number }) =>
		post<PreflightResponse>('/user/uploads/preflight', body),
	/**
	 * PUT the bytes against the API we actually talk to. The grant's own
	 * `uploadUrl` carries the deployment's baked base — a local dev worker
	 * configured with the production URL returns production links there the
	 * grant token does not exist (seed_pdb.py reconstructs the same way).
	 */
	putUrl: (token: string) => `${BASE_URL}${API_PREFIX}/uploads/${encodeURIComponent(token)}`,
	send: (
		uploadUrl: string,
		data: Blob | ArrayBuffer | Uint8Array<ArrayBuffer>,
		contentType: string
	) => uploadBytes(uploadUrl, data, contentType),
	hash: hashArtifact
};

export const artifacts = {
	create: (body: ArtifactInput) => post<ArtifactCreateReceipt>('/artifacts', body),
	get: (id: string) => get<ArtifactRecord>(`/artifacts/${id}`).then(unwrap('artifact')),
	complete: (id: string, body?: { sha256?: string; byteLength?: number }) =>
		post<ArtifactCompleteReceipt>(`/artifacts/${id}/complete`, body ?? {}),
	/** Raw stored bytes (public; ETag = sha256). Vector sequence views use this. */
	content: (id: string) => request<string>(`/artifacts/${id}/content`, { parse: 'text' }),
	/**
	 * Exact stored bytes (public; ETag = ledger sha256). BinaryCIF and any
	 * other binary artifact must come through this, never `content` — text
	 * parsing would corrupt msgpack.
	 */
	contentBytes: (id: string) =>
		request<ArrayBuffer>(`/artifacts/${id}/content`, { parse: 'arrayBuffer' }),
	/**
	 * Absolute download URL: same bytes as `content` plus a server-side
	 * Content-Disposition attachment (a plain `<a download>` is ignored
	 * cross-origin, and the API lives on another host).
	 */
	downloadUrl: (id: string) =>
		`${BASE_URL}${API_PREFIX}/artifacts/${encodeURIComponent(id)}/download`,
	/**
	 * My own uploads, newest first (≤100) — the data source for the
	 * "pick the file I just uploaded" selectors. The personal activity feed
	 * is byte-less and mixed-type, so attachment forms use this dedicated
	 * read instead.
	 */
	mine: () => get<{ artifacts: ArtifactRecord[] }>('/artifacts/mine').then((d) => d.artifacts ?? [])
};

// ---------------------------------------------------- design objects ----

export const cassettes = {
	list: (q?: string) => get<unknown>('/cassettes', { q }),
	get: (id: string) => get<CassetteRow>(`/cassettes/${id}`).then(unwrap('cassette')),
	create: (data: Record<string, unknown>) => post<Record<string, unknown>>('/cassettes', { data })
};

export const vectors = {
	list: (q?: string) => get<unknown>('/vectors', { q }),
	get: (id: string) => get<VectorDetail>(`/vectors/${id}`).then(unwrap('vector')),
	create: (data: Record<string, unknown>) => post<VectorRow>('/vectors', { data }),
	validate: (id: string, body?: { sequenceArtifactId?: string; strict?: boolean }) =>
		post<{
			valid: boolean;
			checks: Array<{ name?: string; status?: string; message?: string }>;
			warnings: string[];
		}>(`/vectors/${id}/validate`, body ?? {}),
	addSupplier: (id: string, body: SupplierInput) =>
		post<Record<string, unknown>>(`/vectors/${id}/suppliers`, body),
	removeSupplier: (id: string, supplierId: string) => del(`/vectors/${id}/suppliers/${supplierId}`)
};

export const constructs = {
	list: () => get<unknown>('/constructs'),
	get: (id: string) => get<ConstructRow>(`/constructs/${id}`).then(unwrap('construct')),
	create: (body: Record<string, unknown>) => post<Record<string, unknown>>('/constructs', body),
	assemble: (body: {
		vector_id: string;
		cassette_id: string;
		insertion_site_id?: string;
		options?: Record<string, unknown>;
	}) =>
		post<{
			constructId: string;
			assembledSequenceSha256: string | null;
			validation: {
				implemented: false;
				valid: null;
				checks: Array<{ status: string; message?: string }>;
			};
		}>('/constructs/assemble', body)
};

export interface CodonSpeciesInput {
	taxon_id: number;
	scientific_name?: string;
	codon_map: Record<string, unknown>;
	genetic_code_table_id?: string;
}

export const codonUsage = {
	list: (filter?: { source?: string; tax_id?: number }) =>
		get<unknown>('/codon-usage', filter as Record<string, string>),
	create: (body: {
		source: string;
		/** single-species form; omit for a multi-species version */
		taxon_id?: number;
		selection_mode: string;
		/** omit it: the server derives the fingerprint from the codon map(s) */
		map_snapshot_sha256?: string;
		/** single-species form; omit for a multi-species version */
		codon_map?: Record<string, unknown>;
		source_url?: string;
		license?: string;
		snapshot_kind?: 'single' | 'multi';
		title?: string;
		scientific_name?: string;
		genetic_code_table_id?: string;
		species?: CodonSpeciesInput[];
	}) => post<{ id: string; created: boolean; snapshotSha256?: string }>('/codon-usage', body),
	resolve: (body: { source: string; taxId: number; refresh?: boolean }) =>
		post<unknown>('/codon-usage/resolve', body),
	get: (id: string) => get<CodonUsageRow>(`/codon-usage/${id}`).then(unwrap('codonUsage'))
};

export const geneticCodes = {
	list: () => get<{ items: GeneticCodeRow[] }>('/genetic-codes'),
	get: (id: string) => get<GeneticCodeRow>(`/genetic-codes/${id}`).then(unwrap('geneticCode')),
	create: (body: {
		ncbiTableId: number;
		name: string;
		description?: string;
		codonToAa: Record<string, string>;
		startCodons?: string[];
		stopCodons?: string[];
		source?: string;
		sourceUrl?: string;
		license?: string;
	}) => post<{ id: string; created: boolean }>('/genetic-codes', body),
	species: (id: string) =>
		get<{ geneticCodeTableId: string; items: GeneticCodeSpeciesBinding[] }>(
			`/genetic-codes/${id}/species`
		),
	/** The table a taxon inherits; `explicit: false` means the standard-code fallback. */
	speciesCode: (taxId: number) =>
		get<SpeciesGeneticCodeData>(`/species/${taxId}/genetic-code`).then(unwrap('geneticCode')),
	setSpeciesCode: (
		taxId: number,
		body: {
			geneticCodeTableId: string;
			scientificName?: string;
			source?: string;
			sourceUrl?: string;
		}
	) =>
		put<SpeciesGeneticCodeData>(`/species/${taxId}/genetic-code`, body).then(unwrap('geneticCode'))
};

export const mutationSets = {
	list: () => get<unknown>('/mutation-sets'),
	get: (id: string) => get<MutationSetRow>(`/mutation-sets/${id}`).then(unwrap('mutationSet')),
	create: (body: {
		base_sequence_id: string;
		mutations: unknown;
		result_sequence_id?: string;
		provenance?: unknown;
	}) => post<{ id: string; created: boolean }>('/mutation-sets', body)
};

// ----------------------------------------------------------- catalogs ----

export const restrictionEnzymes = {
	list: (proteinId?: string, targetMolecule?: string) =>
		get<unknown>('/restriction-enzymes', {
			protein_id: proteinId,
			target_molecule: targetMolecule
		}),
	get: (id: string) =>
		get<RestrictionEnzymeDetail>(`/restriction-enzymes/${id}`).then(unwrap('restrictionEnzyme')),
	create: (body: {
		name: string;
		recognitionSite: string;
		cutPosition: string;
		enzymeType?: string;
		metadata?: unknown;
		proteinId?: string;
		targetMolecule?: string;
	}) => post<Record<string, unknown>>('/restriction-enzymes', body),
	exportBundle: () =>
		get<{
			exportedAt: number | string;
			count: number;
			enzymes: Array<{ name: string; recognitionSite: string; cutPosition: string }>;
		}>('/restriction-enzymes/export'),
	// The §54 binding: an explicit assertion that this enzyme IS that
	// protein record. Any signed-in user may bind or withdraw it; the
	// server proves the protein exists and audits the claim.
	linkProtein: (id: string, proteinId: string) =>
		post<{ id: string; proteinId: string; updated: boolean }>(
			`/restriction-enzymes/${id}/protein`,
			{ proteinId }
		),
	unlinkProtein: (id: string) =>
		del<{ id: string; proteinId: null; updated: boolean }>(`/restriction-enzymes/${id}/protein`),
	suppliers: (id: string) => ({
		add: (body: SupplierInput) =>
			post<Record<string, unknown>>(`/restriction-enzymes/${id}/suppliers`, body),
		remove: (supplierId: string) => del(`/restriction-enzymes/${id}/suppliers/${supplierId}`)
	})
};

export const biobricks = {
	list: (partType?: string) => get<unknown>('/biobricks', { part_type: partType }),
	get: (id: string) =>
		get<BiobrickRow & { vectors?: unknown[] }>(`/biobricks/${id}`).then(unwrap('biobrick')),
	create: (body: {
		name: string;
		partType: string;
		sequence: string;
		description?: string;
		metadata?: unknown;
		categories?: string[];
		parameters?: unknown;
		crossReferences?: unknown;
		origin?: 'submission' | 'batch-import';
	}) => post<Record<string, unknown>>('/biobricks', body),
	linkVector: (id: string, body: { vectorTemplateId: string; role?: string }) =>
		post<Record<string, unknown>>(`/biobricks/${id}/vectors`, body),
	unlinkVector: (id: string, vid: string) => del(`/biobricks/${id}/vectors/${vid}`)
};

export const enzymes = {
	list: (enzymeClass?: string, proteinId?: string, targetMolecule?: string) =>
		get<unknown>('/enzymes', {
			enzyme_class: enzymeClass,
			protein_id: proteinId,
			target_molecule: targetMolecule
		}),
	get: (id: string) => get<EnzymeDetail>(`/enzymes/${id}`).then(unwrap('enzyme')),
	/** Fetch the public BRENDA page for this row's EC. `force` refreshes an
	 *  EC that already has entries; otherwise the server answers from D1. */
	fetchBrenda: (id: string, force = false) =>
		post<EnzymeBrendaFetch>(`/enzymes/${id}/brenda`, undefined, { force }),
	/** Add a researcher's own per-organism measurements beside the BRENDA
	 *  rows. This never edits the imported data. */
	submitSpeciesData: (id: string, body: EnzymeSpeciesDataInput) =>
		post<{ id: string; enzymeId: string; source: string; organism: string }>(
			`/enzymes/${id}/species-data`,
			body
		),
	create: (body: {
		name: string;
		ecNumber?: string;
		enzymeClass: string;
		sourceOrganism?: string;
		substrate?: string;
		product?: string;
		optimalPh?: number;
		optimalTemperature?: number;
		metadata?: unknown;
		proteinId?: string;
		targetMolecule?: string;
	}) => post<Record<string, unknown>>('/enzymes', body),
	linkProtein: (id: string, proteinId: string) =>
		post<{ id: string; proteinId: string; updated: boolean }>(`/enzymes/${id}/protein`, {
			proteinId
		}),
	unlinkProtein: (id: string) =>
		del<{ id: string; proteinId: null; updated: boolean }>(`/enzymes/${id}/protein`),
	suppliers: (id: string) => ({
		add: (body: SupplierInput) => post<Record<string, unknown>>(`/enzymes/${id}/suppliers`, body),
		remove: (supplierId: string) => del(`/enzymes/${id}/suppliers/${supplierId}`)
	})
};

// ------------------------------------------------------------- genes (§55) ----

/** A gene record is one contributor's model of one transcription unit: the
 * row carries its own asserted DNA/RNA letters, regions are append-only
 * evidence rows, and only an RNA CDS region may name its protein (§54 model). */
export const genes = {
	list: (geneType?: string) => get<{ items: GeneListRow[] }>('/genes', { gene_type: geneType }),
	get: (id: string) => get<GeneRecord>(`/genes/${id}`).then(unwrap('gene')),
	create: (body: {
		name: string;
		symbol?: string;
		description?: string;
		geneType?: string;
		organism?: { taxId?: number | null; scientificName?: string | null };
		dnaSequence?: string;
		rnaSequence?: string;
		metadata?: unknown;
	}) =>
		post<{ id: string; name: string; geneType?: string | null; created: boolean }>('/genes', body),
	remove: (id: string) => del<{ deleted: boolean }>(`/genes/${id}`),
	/** Upstream freshness + the latest pending field-level proposal. */
	refreshStatus: (id: string) => get<GeneSourceRefreshData>(`/genes/${id}/refresh`),
	/** Fetch the upstream record now and diff it against the stored plate. */
	refresh: (id: string) => post<GeneSourceRefreshData>(`/genes/${id}/refresh`),
	applyRefresh: (id: string, proposalId: string, fields: string[]) =>
		post<{ gene: GeneRecord; proposal: GeneSourceRefreshProposal }>(
			`/genes/${id}/refresh/${proposalId}/apply`,
			{ fields }
		),
	dismissRefresh: (id: string, proposalId: string) =>
		post<{ proposal: GeneSourceRefreshProposal }>(`/genes/${id}/refresh/${proposalId}/dismiss`),
	regions: {
		list: (geneId: string) => get<GeneRegionsData>(`/genes/${geneId}/regions`),
		add: (
			geneId: string,
			regions: Array<{
				molecule: string;
				regionType: string;
				startPosition?: number | null;
				endPosition?: number | null;
				description: string;
				proteinId?: string;
			}>
		) =>
			post<{
				geneId: string;
				regions: Array<{ id?: string; created: boolean }>;
				duplicates: number;
			}>(`/genes/${geneId}/regions`, { regions }),
		// Reverse read for the protein page: which claimed loci encode this protein.
		byProtein: (proteinId: string) =>
			get<GeneRegionsData>('/gene-regions', { protein_id: proteinId }),
		linkProtein: (regionId: string, proteinId: string) =>
			post<{ id: string; proteinId: string; updated: boolean }>(
				`/gene-regions/${regionId}/protein`,
				{ proteinId }
			),
		unlinkProtein: (regionId: string) =>
			del<{ id: string; proteinId: null; updated: boolean }>(`/gene-regions/${regionId}/protein`)
	}
};

/** On-demand upstream refresh for imported catalogs (genes keep `genes.refresh`). */
export const entityRefresh = {
	status: (entityType: string, id: string) =>
		get<EntityRefreshData>(
			`/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(id)}/refresh`
		),
	check: (entityType: string, id: string) =>
		post<EntityRefreshData>(
			`/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(id)}/refresh`
		),
	apply: (entityType: string, id: string, proposalId: string, fields: string[]) =>
		post<EntityRefreshApplyData>(
			`/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(id)}/refresh/${encodeURIComponent(proposalId)}/apply`,
			{ fields }
		),
	dismiss: (entityType: string, id: string, proposalId: string) =>
		post<EntityRefreshDismissData>(
			`/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(id)}/refresh/${encodeURIComponent(proposalId)}/dismiss`
		)
};

export const enzymeReactions = {
	list: () => get<unknown>('/enzyme-reactions'),
	get: (id: string) => get<ReactionRow>(`/enzyme-reactions/${id}`).then(unwrap('reaction')),
	create: (body: {
		name: string;
		ecNumber?: string;
		substrates?: unknown;
		products?: unknown;
		cofactors?: unknown;
		reversible?: boolean;
		equation?: string;
		source?: unknown;
	}) => post<Record<string, unknown>>('/enzyme-reactions', body)
};

export const pathways = {
	list: () => get<unknown>('/pathways'),
	get: (id: string) =>
		get<PathwayRow & { steps?: PathwayStepRow[] }>(`/pathways/${id}`).then(unwrap('pathway')),
	create: (body: { name: string; description?: string; source?: unknown }) =>
		post<Record<string, unknown>>('/pathways', body),
	remove: (id: string) => del(`/pathways/${id}`),
	addStep: (id: string, body: { reactionId: string; stepOrder: number; enzymeId?: string }) =>
		post<Record<string, unknown>>(`/pathways/${id}/steps`, body),
	removeStep: (id: string, sid: string) => del(`/pathways/${id}/steps/${sid}`)
};

export const strains = {
	list: (species?: string) => get<unknown>('/strains', { species }),
	get: (id: string) =>
		get<StrainRow & { suppliers?: unknown[] }>(`/strains/${id}`).then(unwrap('strain')),
	create: (body: {
		name: string;
		species?: string;
		genotype?: string;
		resistanceMarkers?: unknown;
		background?: string;
		metadata?: unknown;
		origin?: 'submission' | 'batch-import';
	}) => post<Record<string, unknown>>('/strains', body),
	suppliers: (id: string) => ({
		add: (body: SupplierInput) => post<Record<string, unknown>>(`/strains/${id}/suppliers`, body),
		remove: (supplierId: string) => del(`/strains/${id}/suppliers/${supplierId}`)
	})
};

export const cellLines = {
	list: () => get<unknown>('/cell-lines'),
	get: (id: string) =>
		get<CellLineRow & { suppliers?: unknown[] }>(`/cell-lines/${id}`).then(unwrap('cellLine')),
	create: (body: {
		name: string;
		species?: string;
		source?: string;
		growthConditions?: unknown;
		metadata?: unknown;
	}) => post<Record<string, unknown>>('/cell-lines', body),
	suppliers: (id: string) => ({
		add: (body: SupplierInput) =>
			post<Record<string, unknown>>(`/cell-lines/${id}/suppliers`, body),
		remove: (supplierId: string) => del(`/cell-lines/${id}/suppliers/${supplierId}`)
	})
};

export const materialLinks = {
	create: (body: {
		materialType: 'strain' | 'cell_line';
		materialId: string;
		targetType: 'validation' | 'construct' | 'sequence';
		targetId: string;
	}) => post<Record<string, unknown>>('/materials/links', body),
	remove: (id: string) => del(`/materials/links/${id}`),
	forward: (kind: string, id: string) => get<unknown>(`/materials/${kind}/${id}/links`),
	byTarget: (targetType: string, targetId: string) =>
		get<unknown>(`/materials/by-target/${targetType}/${targetId}`)
};

export const mediaRecipes = {
	list: (category?: string) => get<unknown>('/media-recipes', { category }),
	get: (id: string) => get<MediaRecipeRow>(`/media-recipes/${id}`).then(unwrap('recipe')),
	create: (body: {
		name: string;
		category: string;
		composition?: unknown;
		ph?: number;
		notes?: string;
		source?: unknown;
		origin?: 'submission' | 'batch-import';
	}) => post<Record<string, unknown>>('/media-recipes', body)
};

export const conditionTemplates = {
	list: (kind?: string) => get<unknown>('/condition-templates', { kind }),
	get: (id: string) =>
		get<ConditionTemplateRow>(`/condition-templates/${id}`).then(unwrap('template')),
	create: (body: {
		name: string;
		kind: string;
		template: unknown;
		description?: string;
		origin?: 'submission' | 'batch-import';
	}) => post<Record<string, unknown>>('/condition-templates', body)
};

export const reagents = {
	list: () => get<unknown>('/reagents'),
	get: (id: string) =>
		get<ReagentRow & { suppliers?: unknown[] }>(`/reagents/${id}`).then(unwrap('reagent')),
	create: (body: {
		name: string;
		reagentType: string;
		catalogIdentifier?: string;
		description?: string;
		attributes?: unknown;
		origin?: 'submission' | 'batch-import';
	}) => post<Record<string, unknown>>('/reagents', body),
	suppliers: (id: string) => ({
		add: (body: SupplierInput) => post<Record<string, unknown>>(`/reagents/${id}/suppliers`, body),
		remove: (supplierId: string) => del(`/reagents/${id}/suppliers/${supplierId}`)
	})
};

// ----------------------------------------------------- deep data ----

export const measurements = {
	list: (measurementType?: string) =>
		get<unknown>('/measurements', { measurement_type: measurementType }),
	get: (id: string) => get<MeasurementRow>(`/measurements/${id}`).then(unwrap('measurement')),
	create: (body: {
		measurementType: string;
		sequenceId: string;
		validationId: string;
		constructId?: string;
		ligand?: unknown;
		conditions?: unknown;
		value: { value: number; unit: string };
		notes?: string;
		provenance?: unknown;
	}) => post<{ measurement: MeasurementRow; created: boolean }>('/measurements', body)
};

export const mutationEffects = {
	list: () => get<unknown>('/mutation-effects'),
	get: (id: string) =>
		get<MutationEffectRow>(`/mutation-effects/${id}`).then(unwrap('mutationEffect')),
	create: (body: Record<string, unknown>) =>
		post<{ mutationEffect: MutationEffectRow; created: boolean }>('/mutation-effects', body),
	bulk: (records: Array<Record<string, unknown>>) =>
		post<{ created: number; failedCount: number; failed: Array<{ index: number; error: string }> }>(
			'/mutation-effects/bulk',
			{
				records
			}
		)
};

/** The API names the two ends `foldA`/`foldB`; the rest of the app (types,
 *  protein related table, list columns) speaks `foldAId`/`foldBId`. Bridge the
 *  two once here instead of teaching every reader both spellings. */
function interactionRow(r: Record<string, unknown>): InteractionRow {
	const { foldA: _foldA, foldB: _foldB, ...rest } = r;
	return {
		...(rest as InteractionRow),
		foldAId: String(r.foldAId ?? r.foldA ?? ''),
		foldBId: String(r.foldBId ?? r.foldB ?? '')
	};
}

function interactionRows(d: unknown): unknown {
	const obj = d && typeof d === 'object' ? (d as Record<string, unknown>) : null;
	const rows = Array.isArray(d) ? d : Array.isArray(obj?.items) ? (obj.items as unknown[]) : null;
	if (!rows) return d;
	const items = rows.map((r) => interactionRow((r ?? {}) as Record<string, unknown>));
	return Array.isArray(d) ? items : { ...obj, items };
}

export const interactions = {
	list: () => get<unknown>('/protein-interactions').then(interactionRows),
	get: (id: string) =>
		get<InteractionRow>(`/protein-interactions/${id}`)
			.then(unwrap('interaction'))
			.then((r) => interactionRow(r as Record<string, unknown>)),
	create: (body: {
		foldAId: string;
		foldBId: string;
		interactionType: string;
		affinityKd?: number;
		bindingSites?: unknown;
		notes?: string;
		provenance?: unknown;
	}) => post<Record<string, unknown>>('/protein-interactions', body),
	remove: (id: string) => del(`/protein-interactions/${id}`)
};

export interface FeatureLabelRow {
	id: string;
	scope: 'protein' | 'gene' | 'vector' | 'general';
	key: string;
	label: string;
	description: string | null;
	status: 'active' | 'deprecated';
	createdAt?: number;
	updatedAt?: number | null;
}

export const featureLabels = {
	list: (scope?: string, activeOnly?: boolean) =>
		get<{ items: FeatureLabelRow[] }>('/feature-labels', { scope, activeOnly }).then(
			(d) => d.items ?? []
		),
	get: (id: string) =>
		get<FeatureLabelRow>(`/feature-labels/${id}`).then(unwrap<FeatureLabelRow>('featureLabel')),
	create: (body: { scope: string; key: string; label: string; description?: string }) =>
		post<Record<string, unknown>>('/feature-labels', body),
	update: (
		id: string,
		body: { label?: string; description?: string; status?: 'active' | 'deprecated' }
	) => patch<Record<string, unknown>>(`/feature-labels/${id}`, body),
	remove: (id: string) => del<Record<string, unknown>>(`/feature-labels/${id}`)
};

export const families = {
	list: () => get<unknown>('/homology-families'),
	get: (id: string) =>
		get<Record<string, unknown>>(`/homology-families/${id}`).then(unwrap('family')),
	create: (body: { name: string; description?: string; source?: unknown }) =>
		post<Record<string, unknown>>('/homology-families', body),
	remove: (id: string) => del(`/homology-families/${id}`),
	addMember: (
		id: string,
		body: { sequenceId: string; orthologOfSequenceId?: string; conservedSites?: unknown }
	) => post<Record<string, unknown>>(`/homology-families/${id}/members`, body),
	removeMember: (id: string, mid: string) => del(`/homology-families/${id}/members/${mid}`)
};

export const comparisons = {
	list: () => get<unknown>('/structure-comparisons'),
	get: (id: string) =>
		get<ComparisonRow>(`/structure-comparisons/${id}`).then(unwrap('comparison')),
	create: (body: {
		foldId: string;
		referenceKind: string;
		referenceId: string;
		metric: Record<string, number>;
		method: string;
		methodVersion?: string;
		notes?: string;
		provenance?: unknown;
	}) => post<Record<string, unknown>>('/structure-comparisons', body)
};

// --------------------------------------------------- protocols ----

export const protocols = {
	list: () => get<unknown>('/protocols'),
	// The detail envelope carries the protocol body PLUS the 0032 editorial
	// ledger (decisions/currentRound/status derived from the decision);
	// full() returns the whole envelope, get() keeps the old unwrapped shape.
	full: (id: string) => get<Record<string, unknown>>(`/protocols/${id}`),
	get: (id: string) => get<Record<string, unknown>>(`/protocols/${id}`).then(unwrap('protocol')),
	create: (body: Record<string, unknown>) => post<Record<string, unknown>>('/protocols', body),
	update: (id: string, body: Record<string, unknown>) =>
		put<Record<string, unknown>>(`/protocols/${id}`, body),
	remove: (id: string) => del(`/protocols/${id}`),
	reviews: {
		list: (id: string) => get<unknown>(`/protocols/${id}/reviews`),
		create: (
			id: string,
			body: {
				decision: 'approved' | 'request_changes';
				comments?: string;
				confidentialComment?: string;
				conflictDeclared: boolean;
			}
		) => post<Record<string, unknown>>(`/protocols/${id}/reviews`, body)
	},
	moderate: (id: string, rid: string, body: { action: 'invalidate' | 'restore'; reason: string }) =>
		post<Record<string, unknown>>(`/protocols/${id}/reviews/${rid}/moderate`, body),
	// admin-only content edit of a protocol review's comments
	editReview: (id: string, rid: string, body: { comments: string; reason: string }) =>
		post<Record<string, unknown>>(`/protocols/${id}/reviews/${rid}/edit`, body),
	// 0032: publication follows the editor's accept, not a review headcount.
	decide: (id: string, body: { decision: string; letter?: string }) =>
		post<{
			protocolId: string;
			decision: string;
			round: number;
			status: string;
			recorded: boolean;
		}>(`/protocols/${id}/decisions`, body),
	messages: {
		list: (id: string) =>
			get<{ protocolId: string; messages: EditorialMessageRecord[] }>(`/protocols/${id}/messages`),
		create: (id: string, body: { body: string; visibility?: 'internal' | 'with_author' }) =>
			post<{ messageId: string; visibility: string; createdAt: number }>(
				`/protocols/${id}/messages`,
				body
			)
	}
};

// ------------------------------------------------- wiki/references ----

export const wiki = {
	get: (entityType: string, entityId: string) =>
		get<{ wiki?: unknown }>(`/wiki/${entityType}/${entityId}`),
	put: (
		entityType: string,
		entityId: string,
		body: {
			title: string;
			bodyMarkdown: string;
			summary?: string;
			tags?: string[];
			crossReferences?: unknown[];
			related?: unknown[];
			changeSummary: string;
		}
	) => put<Record<string, unknown>>(`/wiki/${entityType}/${entityId}`, body),
	hide: (entityType: string, entityId: string) =>
		del<Record<string, unknown>>(`/wiki/${entityType}/${entityId}`),
	revisions: (entityType: string, entityId: string) =>
		request<unknown>(`/wiki/${entityType}/${entityId}/revisions`),
	revision: (entityType: string, entityId: string, n: number) =>
		request<unknown>(`/wiki/${entityType}/${entityId}/revisions/${n}`)
};

export const references = {
	list: (entityType: string, entityId: string) =>
		request<unknown[]>(`/entities/${entityType}/${entityId}/references`),
	add: (
		entityType: string,
		entityId: string,
		body: {
			source: 'pubmed' | 'doi' | 'other';
			externalId: string;
			title?: string;
			authors?: string[];
			year?: number;
			oaUrl?: string;
		}
	) => post<Record<string, unknown>>(`/entities/${entityType}/${entityId}/references`, body),
	remove: (entityType: string, entityId: string, refId: string) =>
		del(`/entities/${entityType}/${entityId}/references/${refId}`),
	refresh: (refId: string) => post<ReferenceRefreshData>(`/references/${refId}/refresh`, {}),
	/**
	 * Preview a citation from CrossRef/PubMed before attaching it. Shares the
	 * worker's KV cache with the enrich-at-attach path, so lookup-then-add
	 * costs ONE external fetch. An unreachable source answers resolved:false
	 * (200), never an error — previewing is a convenience, not a gate.
	 */
	lookup: (source: string, externalId: string) =>
		get<ReferenceLookupData>('/references/lookup', { source, externalId })
};

/** Organism taxonomy resolution (NCBI): a scientific name or a taxId in,
 * the canonical pair back out, so forms autofill instead of asking the
 * contributor to carry both halves from memory. */
export const taxonomy = {
	lookup: (q: string) => get<TaxonomyLookupData>('/taxonomy/lookup', { q })
};

export const entities = {
	lineage: (entityType: string, entityId: string) =>
		get<Record<string, unknown>>(`/entities/${entityType}/${entityId}/lineage`),
	correct: (id: string, body: Record<string, unknown>) =>
		post<Record<string, unknown>>(`/entities/${id}/corrections`, body),
	retract: (id: string, body: Record<string, unknown>) =>
		post<Record<string, unknown>>(`/entities/${id}/retract`, body)
};

/** Typed relation graph around one entity. `direction` is relative to that
 *  entity: `out` = it is the source, `in` = it is the target. */
export const relations = {
	forEntity: (entityType: string, entityId: string, direction: 'in' | 'out' | 'both' = 'both') =>
		get<EntityRelationsData>(
			`/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/relations`,
			{ direction }
		)
};

/** Upstream accession plate (UniProt, PDB, NCBI, …) for one entity. */
export const externalIdentifiers = {
	forEntity: (entityType: string, entityId: string) =>
		get<EntityExternalIdentifiersData>(
			`/entities/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/external-ids`
		)
};

// -------------------------------------------- community/records ----

export const contributions = {
	list: () => get<unknown>('/contributions'),
	get: (id: string) => get<ApiRecordRow>(`/contributions/${id}`),
	create: (body: Record<string, unknown>) => post<Record<string, unknown>>('/contributions', body),
	decide: (
		id: string,
		body: { decision: 'accept' | 'request_revision' | 'reject'; note?: string }
	) => post<Record<string, unknown>>(`/contributions/${id}`, body)
};

export const corrections = {
	list: () => get<unknown>('/corrections'),
	get: (id: string) => get<ApiRecordRow>(`/corrections/${id}`),
	create: (body: Record<string, unknown>) => post<Record<string, unknown>>('/corrections', body)
};

export const retractions = {
	list: () => get<unknown>('/retractions'),
	get: (id: string) => get<ApiRecordRow>(`/retractions/${id}`),
	create: (body: Record<string, unknown>) => post<Record<string, unknown>>('/retractions', body)
};

export const benchmarks = {
	list: () => get<unknown>('/benchmarks'),
	get: (id: string) => get<ApiRecordRow>(`/benchmarks/${id}`),
	create: (body: Record<string, unknown>) => post<Record<string, unknown>>('/benchmarks', body),
	metrics: (id: string) => get<{ metrics?: unknown[]; note?: string }>(`/benchmarks/${id}/metrics`)
};

export const modelFeedback = {
	list: () => get<unknown>('/model-feedback'),
	get: (id: string) => get<ApiRecordRow>(`/model-feedback/${id}`),
	create: (body: Record<string, unknown>) => post<Record<string, unknown>>('/model-feedback', body)
};

export const records = {
	create: (body: { entity_type: string; payload: unknown }) =>
		post<Record<string, unknown>>('/records', body),
	createTyped: (
		kind:
			'contribution' | 'correction' | 'retraction' | 'benchmark' | 'model-feedback' | 'construct',
		payload: unknown
	) => post<Record<string, unknown>>(`/${kind}`, payload),
	get: (id: string) => get<ApiRecordRow>(`/records/${id}`)
};

// ------------------------------------------------------ search/stats ----

export const search = {
	run: (body: SearchBody) => requestEnvelope<SearchHit[]>('/search', { method: 'POST', body })
};

/** Federated external catalogs: UniProt, PDB and NCBI Gene. A source that is
 *  unreachable answers `degraded:true` (200) instead of failing the batch, so
 *  the search page can show the other sources' hits. Import is anonymous: it
 *  materialises the external record in SPD or returns the existing one
 *  (`created:false`), and `route` is where the UI should go next. */
export const external = {
	search: (source: ExternalSource, q: string, limit = 10) =>
		get<ExternalSearchData>('/external/search', { source, q, limit }),
	import: (source: ExternalSource, externalId: string) =>
		post<ExternalImportResult>('/external/import', { source, externalId }),
	/** Resolve NP_/XP_ or UniProt protein accessions to a local protein, importing when absent. */
	resolveProtein: (accession: string) =>
		post<ProteinResolveResult>('/external/resolve-protein', { accession })
};

export const schema = {
	get: (entityType: string) => get<Record<string, unknown>>(`/schema/${entityType}`)
};

export const users = {
	spdFactor: (id: string) => get<SpdFactorData>(`/users/${id}/spd-factor`)
};

export const stats = {
	overview: () => get<StatsOverview>('/stats/overview'),
	trending: (entityType?: string, days?: number) =>
		get<TrendingData>('/stats/trending', { entity_type: entityType, days }),
	matchRate: (months?: number) => get<MatchRateData>('/stats/validation-match-rate', { months }),
	envPreferences: () => get<EnvPreferencesData>('/stats/environment-preferences'),
	leaderboard: () => get<LeaderboardData>('/stats/leaderboard')
};

export const health = {
	check: () => requestEnvelope<{ status: string; service: string; apiVersion: string }>('/health')
};

// ------------------------------------------- universal API tokens (§40) ----

export const apiTokens = {
	list: () => get<{ tokens: ApiTokenRow[] }>('/user/me/api-tokens'),
	mint: (body: ApiTokenInput) => post<ApiTokenMintReceipt>('/user/me/api-tokens', body),
	revoke: (id: string) =>
		post<{ ok: boolean; tokenId: string; revokedAt: number }>(
			`/user/me/api-tokens/${id}/revoke`,
			{}
		),
	/** admin-only entitlement grant for graph-query metering (§41) */
	setTier: (id: string, body: TokenTierInput) =>
		post<{ ok: boolean; tokenId: string; tier: string }>(`/admin/api-tokens/${id}/tier`, body)
};

// -------------------------------------------------- graph query DSL (§41) ----

export const graphQuery = {
	/**
	 * Envelope read — meta carries the metering fields (§41). A caller may
	 * bring their own Universal API Token (§40): it rides as `Authorization:
	 * Bearer` and `resolve_tier` prefers it over the session cookie, so the
	 * token's tier (deeper tree, bigger budget) governs this run.
	 */
	run: (body: GraphQueryInput, bearerToken?: string) =>
		request<GraphQueryData>('/query', {
			method: 'POST',
			body,
			headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : undefined
		})
};

// ------------------------------------------------- provenance (§43) ----

export const provenance = {
	create: (body: SnapshotInput) => post<ProvenanceReceipt>('/provenance/snapshots', body),
	forEntity: (entityType: string, entityId: string) =>
		get<unknown>(
			`/provenance/snapshots/by-entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`
		),
	/**
	 * Absolute URL for the stored snapshot bytes (public; Content-Type from the
	 * ledger, ETag = sha256). Text media only — binaries live in artifacts.
	 */
	contentUrl: (id: string) => `${BASE_URL}${API_PREFIX}/provenance/snapshots/${id}/content`
};

// ---------------------------------------------------- PDB catalog (§44) ----

export const pdbEntries = {
	list: (limit?: number) => get<unknown>('/pdb-entries', { limit }),
	get: (id: string) => get<PdbEntryRow>(`/pdb-entries/${id}`).then(unwrap('entry')),
	entities: (id: string) => get<PdbEntitiesData>(`/pdb-entries/${id}/entities`),
	create: (body: PdbEntryInput) =>
		post<{ ok: boolean; pdbId: string; created: boolean; updatedAt: number }>('/pdb-entries', body)
};
