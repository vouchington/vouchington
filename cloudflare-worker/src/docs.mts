import { edgeErrorResponse, NO_STORE_HEADERS } from './error-response.mts'
import {
  INTERNAL_REFERENCE_BASIC_AUTH_CHALLENGE,
  requiredBasicAuthDecision,
} from './basic-auth-credentials.mts'
import type { Env } from './types.mts'

const MIME_TYPES: Record<string, string> = {
  css: 'text/css; charset=utf-8',
  gif: 'image/gif',
  html: 'text/html; charset=utf-8',
  ico: 'image/x-icon',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  png: 'image/png',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
  webp: 'image/webp',
  xml: 'application/xml; charset=utf-8',
}

const DEFAULT_MIME_TYPE = 'application/octet-stream'

// R2 is a flat key-value store, so a `..` segment can't escape the bucket — this is
// defense-in-depth only. WHATWG URL parsing already collapses literal `..` segments (plain
// or percent-decoded, e.g. `%2e%2e`) out of `url.pathname` before this runs, so only encoded
// bytes that survive parsing unresolved (an encoded slash keeps a trailing `..` segment
// intact, e.g. `/..%2f..%2foutside`) can still reach here — matches the guard style in
// routing.mts's sitemap path handling.
const ENCODED_PATH_TRAVERSAL_RE = /%(?:2e|2f|5c)/i

/**
 * Maps a request path to its R2 object key. Mirrors static-site publishing conventions:
 * root and trailing-slash paths resolve to `index.html`; extensionless paths (no `.` in
 * the final segment) are treated as directories and resolve to `<path>/index.html` too.
 */
export function resolveDocsObjectKey(pathname: string): string {
  const withoutLeadingSlash = pathname.replace(/^\/+/, '')
  if (withoutLeadingSlash === '' || withoutLeadingSlash.endsWith('/')) {
    return `${withoutLeadingSlash}index.html`
  }
  const finalSegment = withoutLeadingSlash.slice(withoutLeadingSlash.lastIndexOf('/') + 1)
  if (!finalSegment.includes('.')) {
    return `${withoutLeadingSlash}/index.html`
  }
  return withoutLeadingSlash
}

export function contentTypeForKey(key: string): string {
  const dotIndex = key.lastIndexOf('.')
  if (dotIndex === -1) return DEFAULT_MIME_TYPE
  const extension = key.slice(dotIndex + 1).toLowerCase()
  return MIME_TYPES[extension] ?? DEFAULT_MIME_TYPE
}

/**
 * Serves static docs content from the `DOCS_BUCKET` R2 binding after requiring Basic Auth.
 */
export async function serveDocs(request: Request, env: Env): Promise<Response> {
  const authDecision = requiredBasicAuthDecision(
    request.headers.get('authorization'),
    env.BASIC_AUTH_CREDENTIALS,
  )
  if (authDecision === 'misconfigured') {
    return edgeErrorResponse(
      503,
      'Basic authentication is not configured',
      'BASIC_AUTH_CONFIG_INVALID',
      { vary: 'Authorization' },
    )
  }
  if (authDecision === 'unauthorized') {
    return edgeErrorResponse(401, 'Authentication required', 'UNAUTHORIZED', {
      'www-authenticate': INTERNAL_REFERENCE_BASIC_AUTH_CHALLENGE,
      vary: 'Authorization',
    })
  }
  const bucket = env.DOCS_BUCKET
  if (!bucket) {
    return edgeErrorResponse(500, 'Docs bucket not configured', 'DOCS_BUCKET_MISSING')
  }
  const url = new URL(request.url)
  if (ENCODED_PATH_TRAVERSAL_RE.test(url.pathname)) {
    return edgeErrorResponse(404, 'Not Found', 'DOCS_OBJECT_NOT_FOUND')
  }
  const key = resolveDocsObjectKey(url.pathname)
  const object = await bucket.get(key)
  if (!object) {
    return edgeErrorResponse(404, 'Not Found', 'DOCS_OBJECT_NOT_FOUND')
  }
  // @cloudflare/workers-types declares its own generic ReadableStream, distinct from the
  // lib.webworker one Response's BodyInit expects; cast at this single boundary rather than
  // widening BodyInit or importing the ambient global workers-types.d.ts repo-wide.
  return new Response(object.body as unknown as ReadableStream, {
    status: 200,
    headers: {
      'content-type': contentTypeForKey(key),
      ...NO_STORE_HEADERS,
      'cache-control': 'private, no-store, max-age=0, must-revalidate',
      vary: 'Authorization',
    },
  })
}

export type ServeDocs = typeof serveDocs
