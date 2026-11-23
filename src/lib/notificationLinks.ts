/**
 * Where a notification's "Open" action may take the reader (FR 5.0, Req 117/120).
 *
 * Links come from server-side templates, but the page still only follows an
 * in-app path: no other origin, no protocol-relative or backslash tricks, and
 * no link back to the notifications page itself (that is where the reader
 * already is, so there is nothing to open). Anything else gets no Open action.
 */
const ORIGIN = 'https://app.invalid';

export const notificationDestination = (link: string | null | undefined): string | null => {
  if (typeof link !== 'string') return null;
  const value = link.trim();
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\s]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== ORIGIN) return null;
  if (url.pathname.replace(/\/+$/, '') === '/notifications') return null;
  return `${url.pathname}${url.search}${url.hash}`;
};
