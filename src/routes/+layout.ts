// The API lives on a sibling origin behind an HttpOnly SameSite=Lax cookie that
// only the browser carries, so every page resolves its session client-side.
export const ssr = false;
export const prerender = false;
export const csr = true;
