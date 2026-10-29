/**
 * Resolves the appropriate base URL for public guest links and QR codes.
 * Ensures that production links point to the canonical HTTPS host
 * rather than transient or local dev URLs when configured.
 */
export function getPublicBaseUrl(): string {
  // 1. Check explicit client-side environment variable
  const envUrl = (import.meta as any).env?.VITE_PUBLIC_APP_URL || (import.meta as any).env?.APP_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.startsWith('http')) {
    return envUrl.replace(/\/+$/, '');
  }

  // 2. Browser runtime resolution
  if (typeof window !== 'undefined' && window.location?.origin) {
    // If running on a cloud run preview or dev port, default to origin or Firebase hosting in production
    const origin = window.location.origin;
    return origin.replace(/\/+$/, '');
  }

  // 3. Canonical production default for pd-event-gallery
  return 'https://pd-event-gallery.web.app';
}

export function buildGuestEventUrl(publicToken: string): string {
  const base = getPublicBaseUrl();
  return `${base}/e/${encodeURIComponent(publicToken)}`;
}
