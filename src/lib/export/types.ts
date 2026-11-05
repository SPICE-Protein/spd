/** One entry in an export menu: a filename and a lazy serializer. */
export interface ExportFormat {
	key: string;
	label: string;
	filename: string;
	/** MIME type for the blob; defaults to text/plain. */
	mime?: string;
	/** Runs only when the user picks the format, so heavy parsers stay lazy. */
	build: () => string | Promise<string>;
	disabled?: boolean;
}
