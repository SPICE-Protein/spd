/**
 * Browser download helper shared by every export surface.
 *
 * A record filename comes from user-entered names, so path separators and
 * Windows-reserved characters are folded to underscores before the browser
 * sees them; the blob URL is revoked after the click has been handed to the
 * download manager.
 */
export function downloadText(
	filename: string,
	text: string,
	mime = 'text/plain;charset=utf-8'
): void {
	downloadBlob(filename, new Blob([text], { type: mime }), 'export.txt');
}

/** Same handoff, for formats that are already encoded bytes. */
export function downloadBlob(filename: string, blob: Blob, fallback = 'export.bin'): void {
	const safe = filename.replace(/[\\/:*?"<>|]+/g, '_').trim() || fallback;
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = safe;
	a.rel = 'noopener';
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
