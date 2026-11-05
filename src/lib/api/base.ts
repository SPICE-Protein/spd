/**
 * Core HTTP plumbing for the SPD API.
 *
 * Contract (spd_backend FEATURE_LIST §1.2/§1.4, response-contract lock 2026-09-30):
 * - Wire format is camelCase for requests AND responses.
 * - Reads come back as an envelope `{ data, meta, error }`; bare write receipts are
 *   plain objects. `request()` auto-detects the envelope and returns `data`.
 * - Errors use HTTP status + `{ data:null, meta, error:{ code, message, fields? } }`.
 * - Auth is the HttpOnly `spd_session` cookie — every fetch sends credentials:'include'.
 *   The frontend (d.spicebio.top) and API (d-api.spicebio.top) are cross-origin but
 *   same-site, which is exactly what SameSite=Lax allows; unlisted origins get no CORS
 *   headers at all, so `SPD_ALLOWED_ORIGINS` must list this frontend.
 */

/**
 * API base URL.
 * - Production: the API origin `https://d-api.spicebio.top` (same-site with the
 *   frontend host d.spicebio.top, so the SameSite=Lax session cookie rides on
 *   every fetch; CORS trust is `SPD_ALLOWED_ORIGINS`, already listing this host).
 * - Development: empty string → same-origin `/api/v1` through the vite proxy.
 *   A cross-site dev base (localhost → d-api) would NOT send the Lax cookie on
 *   fetches, silently killing the session; keep the proxy for `pnpm dev`.
 */
import { dev } from '$app/environment';

export const BASE_URL = dev ? '' : 'https://d-api.spicebio.top';

export const API_PREFIX = '/api/v1';

export interface ApiMeta {
	schemaVersion?: string;
	count?: number;
	page?: number;
	pageSize?: number;
	[key: string]: unknown;
}

export interface ApiErrorBody {
	code: string;
	message: string;
	fields?: Record<string, string>;
}

export interface Envelope<T> {
	data: T;
	meta: ApiMeta;
	error: ApiErrorBody | null;
}

/** API error with the documented `{code,message,fields}` payload preserved. */
export class SpdApiError extends Error {
	status: number;
	code: string;
	fields: Record<string, string> | undefined;

	constructor(status: number, body: ApiErrorBody | null, fallbackMessage?: string) {
		super(body?.message ?? fallbackMessage ?? `HTTP ${status}`);
		this.status = status;
		this.code = body?.code ?? 'HTTP_ERROR';
		this.fields = body?.fields;
		this.name = 'SpdApiError';
	}

	get isAuth(): boolean {
		return this.status === 401;
	}
	get isForbidden(): boolean {
		return this.status === 403;
	}
	get isNotFound(): boolean {
		return this.status === 404 || (this.status === 400 && /not found/i.test(this.message));
	}
}

interface RequestOptions {
	method?: string;
	/** JSON body (object/array/string) or raw bytes for uploads. */
	body?: unknown;
	query?: Record<string, string | number | boolean | undefined | null>;
	headers?: Record<string, string>;
	/** Set when the endpoint returns non-JSON (the openapi document is JSON,
	 * fine; artifact bytes need `arrayBuffer` — parsing them as text would
	 * corrupt msgpack). */
	parse?: 'json' | 'text' | 'arrayBuffer';
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
	let url = `${BASE_URL}${API_PREFIX}${path}`;
	if (query) {
		const qs = new URLSearchParams();
		for (const [k, v] of Object.entries(query)) {
			if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
		}
		const s = qs.toString();
		if (s) url += (url.includes('?') ? '&' : '?') + s;
	}
	return url;
}

async function toBody(body: unknown): Promise<{ payload: BodyInit | undefined; headers: Record<string, string> }> {
	if (body === undefined || body === null) return { payload: undefined, headers: {} };
	if (body instanceof Blob || body instanceof ArrayBuffer || body instanceof DataView || typeof body === 'string') {
		// Raw upload: caller supplies content type via headers.
		return { payload: body as BodyInit, headers: {} };
	}
	return { payload: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } };
}

/**
 * Perform one API call. Envelope responses return `data`; bare receipts return the
 * object as-is. Non-2xx throws SpdApiError with the documented error body.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const { payload, headers } = await toBody(options.body);
	const res = await fetch(buildUrl(path, options.query), {
		method: options.method ?? 'GET',
		credentials: 'include',
		headers: { Accept: 'application/json', ...headers, ...options.headers },
		body: payload
	});

	const isJson = (res.headers.get('content-type') ?? '').includes('json');
	if (options.parse === 'arrayBuffer') {
		// Bytes endpoints succeed with octet-stream and fail with a JSON
		// error envelope — build the SpdApiError from the text, then hand
		// out the raw buffer; never route bytes through text/JSON sniffing.
		if (!res.ok) {
			const raw = await res.text().catch(() => '');
			let errBody: ApiErrorBody | null = null;
			try {
				errBody = (JSON.parse(raw) as { error?: ApiErrorBody }).error ?? null;
			} catch {
				/* non-JSON failure body: fall through with the raw text */
			}
			throw new SpdApiError(res.status, errBody, raw.slice(0, 200));
		}
		return (await res.arrayBuffer()) as T;
	}
	let parsed: unknown = null;
	if (options.parse === 'text') {
		parsed = await res.text();
	} else if (isJson) {
		parsed = await res.json();
	}

	if (!res.ok) {
		const errBody =
			parsed && typeof parsed === 'object' && 'error' in (parsed as Record<string, unknown>)
				? ((parsed as { error: ApiErrorBody }).error ?? null)
				: null;
		throw new SpdApiError(res.status, errBody, typeof parsed === 'string' ? parsed.slice(0, 200) : undefined);
	}

	// Envelope detection: success envelopes always carry `meta` and `error` keys.
	if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
		const obj = parsed as Record<string, unknown>;
		if ('data' in obj && 'error' in obj && ('meta' in obj || Object.keys(obj).length === 2)) {
			return obj.data as T;
		}
	}
	return parsed as T;
}

/** Like `request` but returns the full envelope (to read `meta.count` etc.). */
export async function requestEnvelope<T>(path: string, options: RequestOptions = {}): Promise<Envelope<T>> {
	const { payload, headers } = await toBody(options.body);
	const res = await fetch(buildUrl(path, options.query), {
		method: options.method ?? 'GET',
		credentials: 'include',
		headers: { Accept: 'application/json', ...headers, ...options.headers },
		body: payload
	});
	const parsed = (await res.json()) as Envelope<T>;
	if (!res.ok) throw new SpdApiError(res.status, parsed?.error ?? null);
	return parsed;
}

export const get = <T>(path: string, query?: RequestOptions['query']) =>
	request<T>(path, { method: 'GET', query });
export const post = <T>(path: string, body?: unknown, query?: RequestOptions['query']) =>
	request<T>(path, { method: 'POST', body, query });
export const put = <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body });
export const patch = <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body });
export const del = <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body });

/**
 * Raw PUT to an absolute upload URL returned by preflight.
 * Content-Length/Content-Type must match the preflight claim exactly.
 */
export async function uploadBytes(
	absoluteUrl: string,
	data: Blob | ArrayBuffer | Uint8Array<ArrayBuffer>,
	contentType: string
): Promise<{ ok: boolean; objectKey: string; size: number; sha256: string }> {
	const res = await fetch(absoluteUrl, {
		method: 'PUT',
		credentials: 'include',
		headers: { 'Content-Type': contentType },
		body: data
	});
	let parsed: unknown = null;
	try {
		parsed = await res.json();
	} catch {
		/* non-JSON body below */
	}
	if (!res.ok) {
		const errBody =
			parsed && typeof parsed === 'object' && 'error' in (parsed as Record<string, unknown>)
				? ((parsed as { error: ApiErrorBody }).error ?? null)
				: null;
		throw new SpdApiError(res.status, errBody);
	}
	return parsed as { ok: boolean; objectKey: string; size: number; sha256: string };
}

/** sha256 over bytes, formatted "sha256:<64 hex>" the way SPD stores every content hash. */
export async function hashArtifact(data: ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', data);
	const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
	return `sha256:${hex}`;
}
