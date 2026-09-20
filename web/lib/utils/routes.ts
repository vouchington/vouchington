// Paths that the Next.js proxy should skip entirely (Next.js internals, static assets).
// Backend routing is now handled by the Cloudflare Worker — proxy.ts only handles
// session validation and cookie management for web page requests.
const PROXY_BYPASS_EXACT_PATHS = ['/favicon.ico', '/storybook'] as const

const PROXY_BYPASS_PREFIX_PATHS = [
  '/_next/static/',
  '/_next/image',
  '/_next/data/',
  '/_next/',
  '/storybook/',
] as const

const STATIC_ASSET_PATH_PATTERN =
  /\.(?:avif|bmp|css|gif|ico|jpe?g|js|json|map|mjs|png|svg|txt|webmanifest|webp|woff2?)$/i

// Paths handled outside normal web-page proxy session validation.
// In production these are routed directly by the Cloudflare Worker to backend,
// sitemap S3, or other non-web origins; in dev they may still hit Next.js when
// accessed directly (bypassing the worker).
const BACKEND_PREFIX_PATHS = ['/api/', '/infra/', '/sitemaps/'] as const
const BACKEND_EXACT_PATHS = [
  '/authorize',
  '/register',
  '/revoke',
  '/sitemap.xml',
  '/token',
] as const

export function isBackendPath(pathname: string): boolean {
  return (
    BACKEND_PREFIX_PATHS.some(prefix => pathname.startsWith(prefix)) ||
    BACKEND_EXACT_PATHS.includes(pathname as (typeof BACKEND_EXACT_PATHS)[number])
  )
}

export function shouldBypassProxyPath(pathname: string): boolean {
  if (isBackendPath(pathname)) {
    return false
  }

  if (PROXY_BYPASS_EXACT_PATHS.includes(pathname as (typeof PROXY_BYPASS_EXACT_PATHS)[number])) {
    return true
  }

  if (PROXY_BYPASS_PREFIX_PATHS.some(prefix => pathname.startsWith(prefix))) {
    return true
  }

  return STATIC_ASSET_PATH_PATTERN.test(pathname)
}
