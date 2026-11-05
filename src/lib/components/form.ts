export type FieldKind = 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'json' | 'list' | 'intList' | 'objectList' | 'multiPick' | 'artifactPick' | 'organism' | 'fieldPatch';

export interface FormField {
	name: string;
	kind?: FieldKind;
	required?: boolean;
	/** enum message namespace for select option labels */
	ns?: string;
	/**
	 * Select options: plain vocabulary strings (localized through `ns`), or
	 * explicit `{value,label}` pairs when the choices are dynamic records the
	 * page already loaded (e.g. supersedes_id over this fold's assessment
	 * versions — a bare uuid in a dropdown is just paste friction wearing a
	 * different hat).
	 */
	options?: Array<string | { value: string; label: string }>;
	hint?: string;
	label?: string;
	rows?: number;
	placeholder?: string;
	/**
	 * Reference field: render a TargetPicker scoped to this entityType so the
	 * id is found by search, not pasted. The resolved id still lands in
	 * values[name], so build/required logic is unchanged.
	 * '*' means search across every record type (community filings can point
	 * at anything, so they cannot name one entityType up front).
	 */
	picker?: string;
	/** picker only: human label for a value seeded from a URL param */
	pickerLabel?: string;
	/** objectList only: sub-fields rendered as labeled inputs per item */
	itemFields?: Array<{ key: string; required?: boolean }>;
	/**
	 * multiPick / artifactPick only: restrict the "my uploads" list to these
	 * artifact kinds (e.g. an MD-analysis field wants `md_trajectory`). Left
	 * empty the picker offers every kind the contributor owns.
	 */
	pickKinds?: string[];
	/** multiPick / artifactPick only: the kind preselected in the inline upload */
	uploadDefaultKind?: string;
	/**
	 * organism only: the values key that stores the scientific name while
	 * `name` stores the taxId (NCBI resolves the pair; the field's own label
	 * groups both boxes). Omitted when the record stores only the taxId —
	 * then the name box is a throwaway search seed (codon tables).
	 */
	companion?: string;
	/**
	 * fieldPatch only: the values key holding the TARGET record's id whose
	 * fields the correction asserts (e.g. 'targetId'). The editor fetches
	 * that record once and offers its keys as datalist candidates with
	 * current values pre-filled; a field outside the list stays typeable.
	 */
	itemsOf?: string;
}
