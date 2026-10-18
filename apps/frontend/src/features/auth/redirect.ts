/** Where signed-in users land when no valid `redirect` is given. */
export const DEFAULT_REDIRECT = "/projects";

/**
 * Accepts only same-origin relative paths. The browser's URL parser is the
 * judge: tabs and newlines are stripped and `\` becomes `/` before the origin
 * is read, so `/\host` and `/\t/host` resolve cross-origin and fall back.
 */
export function resolveRedirect(redirect: string | undefined): string {
  if (!redirect?.startsWith("/")) return DEFAULT_REDIRECT;
  try {
    const url = new URL(redirect, window.location.origin);
    if (url.origin !== window.location.origin) return DEFAULT_REDIRECT;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_REDIRECT;
  }
}
