// Only http(s) URLs may be placed into HTML strings handed to Leaflet popups.
// HTML escaping alone does not stop `javascript:` or `data:` links.
export function safeHttpUrl(value: unknown): string {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function origin(value: string | undefined): string | null {
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
}

// GitHub Pages cannot send response headers, so the policy ships as a <meta> tag.
// 'unsafe-inline' scripts remain because the Next.js static export inlines its
// bootstrap code; all third-party script hosts are limited to Cloudflare analytics.
export function contentSecurityPolicy(): string {
  const dataOrigins = [
    process.env.NEXT_PUBLIC_POLICY_R2_URL,
    process.env.NEXT_PUBLIC_LEGISLATION_R2_URL,
    process.env.NEXT_PUBLIC_INVESTIGATIONS_R2_URL,
  ].map(origin).filter((o): o is string => Boolean(o));
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://www.google.com https://*.gstatic.com https://*.tile.openstreetmap.org https://tile.openstreetmap.org https://server.arcgisonline.com",
    "font-src 'self' data:",
    `connect-src 'self' https://cloudflareinsights.com https://cdn.jsdelivr.net ${dataOrigins.join(" ")}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://buttondown.com",
    "upgrade-insecure-requests",
  ].join("; ");
}
