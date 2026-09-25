import {
  scrubHeaders as scrubUpstreamHeaders,
  scrubSpanAttributes as scrubUpstreamSpanAttributes,
  stripUrlQueryAndFragment as stripUrlQueryString,
} from '@vouchington/utils/observability'

export { stripUrlQueryString }

// Grafana IRM heartbeat endpoints carry their bearer credential in the path,
// not in a query string. Redact that segment before a URL can leave through a
// span, breadcrumb, or Sentry request field.
function scrubObservabilityUrl(value: string): string {
  return stripUrlQueryString(value).replace(
    /(\/oncall\/integrations\/v1\/formatted_webhook\/)[^/]+(\/heartbeat\/?)/,
    '$1[REDACTED]$2',
  )
}

// Sentry SDK attribute/breadcrumb/request keys that carry a URL or a
// URL's query/fragment component. @vouchington/utils owns the generic
// mechanics; Vouchington owns this Sentry-specific key boundary and its
// copy-on-write identity contract.
//
// Two of the string keys below — http.request.header.referer and
// http.request.header.referrer — have different provenance: they are
// constructed at runtime by @sentry/core's httpHeadersToSpanAttributes
// (utils/request.js), which emits `http.request.header.<name>` for every
// request header surviving Sentry's PII deny list. `referer`/`referrer`
// survive because neither matches PII_HEADER_SNIPPETS nor
// SENSITIVE_KEY_SNIPPETS (utils/data-collection/filtering-snippets.js), even
// though the header's value is itself a full URL (see #8866).

// HTTP header names whose value is a full URL. `referer` is the wire spelling
// (the RFC 9110 misspelling) — do not "correct" it. `referrer` is the
// JS/Fetch-API spelling, covered in case a header is hand-rolled that way.
// `origin` is deliberately absent: scheme+host+port only, no path or query.
const URL_BEARING_HEADER_NAMES: readonly string[] = ['referer', 'referrer']

// Span-attribute twins of the header names above: httpHeadersToSpanAttributes
// emits `http.request.header.<name>` for every header it does not deny.
const URL_HEADER_ATTRIBUTE_KEYS: readonly string[] = URL_BEARING_HEADER_NAMES.map(
  name => `http.request.header.${name}`,
)

// Values are a full/partial URL string; strip the query and fragment in place.
const URL_STRING_ATTRIBUTE_KEYS: readonly string[] = Object.freeze([
  'url',
  'url.full',
  'http.url',
  'http.target',
  ...URL_HEADER_ATTRIBUTE_KEYS,
])

// Values ARE the query string or fragment itself, so the whole key is dropped
// rather than rewritten.
const URL_COMPONENT_ONLY_ATTRIBUTE_KEYS = [
  'url.query',
  'http.query',
  'url.fragment',
  'http.fragment',
] as const

export const SCRUBBED_URL_ATTRIBUTE_KEYS: readonly string[] = Object.freeze([
  ...URL_STRING_ATTRIBUTE_KEYS,
  ...URL_COMPONENT_ONLY_ATTRIBUTE_KEYS,
])

const URL_ONLY_SCRUB_OPTIONS = { credentialHeaders: [] } as const

function isUrlBearingHeader(name: string): boolean {
  return URL_BEARING_HEADER_NAMES.includes(name.toLowerCase())
}

export function scrubSpanUrlAttributes<TData extends Record<string, unknown>>(data: TData): TData {
  const urlEntries = Object.entries(data).filter(([key]) =>
    SCRUBBED_URL_ATTRIBUTE_KEYS.includes(key),
  )
  if (!urlEntries.length) return data

  // Project only URL keys so @vouchington/utils cannot apply its broader
  // credential-attribute policy to this URL-only helper.
  const originalUrlData = Object.fromEntries(urlEntries)
  const urlData = Object.fromEntries(
    urlEntries.map(([key, value]) => [
      key,
      typeof value === 'string' ? scrubObservabilityUrl(value) : value,
    ]),
  )
  const scrubbedUrlData = scrubUpstreamSpanAttributes(urlData, URL_ONLY_SCRUB_OPTIONS)
  if (sameEntries(originalUrlData, scrubbedUrlData)) return data

  const result: Array<[string, unknown]> = []
  for (const [key, value] of Object.entries(data)) {
    if (!SCRUBBED_URL_ATTRIBUTE_KEYS.includes(key)) {
      result.push([key, value])
    } else if (Object.hasOwn(scrubbedUrlData, key)) {
      result.push([key, scrubbedUrlData[key]])
    }
  }
  return Object.fromEntries(result) as TData
}

export function scrubEventBreadcrumbs<TBreadcrumb extends { data?: Record<string, unknown> }>(
  breadcrumbs: TBreadcrumb[] | undefined,
): TBreadcrumb[] | undefined {
  if (!breadcrumbs?.length) return breadcrumbs
  let changed = false
  const result = breadcrumbs.map(breadcrumb => {
    if (typeof breadcrumb.data !== 'object' || breadcrumb.data === null) return breadcrumb
    const data = scrubSpanUrlAttributes(breadcrumb.data)
    if (data === breadcrumb.data) return breadcrumb
    changed = true
    return { ...breadcrumb, data }
  })
  return changed ? result : breadcrumbs
}

function isHeaderRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Rebuilds a headers record with URL-bearing header values stripped of their
// query string/fragment. Non-URL-bearing headers and non-string values pass
// through byte-identical — this must not become a general PII redaction
// pass. Credential headers require exact deny-list filtering rather than URL
// stripping, so that separate policy lives in sentry-event-scrubbing.mts.
function scrubHeaderUrlValues(headers: Record<string, unknown>): Record<string, unknown> {
  const dirtyUrlHeaders = Object.fromEntries(
    Object.entries(headers).filter(
      ([name, value]) => isUrlBearingHeader(name) && valueNeedsUrlScrubbing(value),
    ),
  )
  const scrubbedUrlHeaders = scrubUpstreamHeaders(dirtyUrlHeaders, [])
  const result: Array<[string, unknown]> = []
  for (const [name, value] of Object.entries(headers)) {
    result.push([name, Object.hasOwn(scrubbedUrlHeaders, name) ? scrubbedUrlHeaders[name] : value])
  }
  return Object.fromEntries(result)
}

export function scrubRequestUrlFields<TRequest extends object>(
  request: TRequest | undefined,
): TRequest | undefined {
  if (!request) return request
  const fields = request as Record<string, unknown>
  const headersValue = fields.headers
  const urlNeedsScrubbing = valueNeedsUrlScrubbing(fields.url)
  const headersNeedScrubbing =
    isHeaderRecord(headersValue) &&
    Object.entries(headersValue).some(
      ([name, value]) => isUrlBearingHeader(name) && valueNeedsUrlScrubbing(value),
    )
  if (!('query_string' in request) && !urlNeedsScrubbing && !headersNeedScrubbing) return request
  const result: Array<[string, unknown]> = []
  for (const [key, value] of Object.entries(request) as Array<[string, unknown]>) {
    if (key === 'query_string') continue
    if (key === 'url' && typeof value === 'string') {
      result.push([key, scrubObservabilityUrl(value)])
    } else if (key === 'headers' && headersNeedScrubbing) {
      result.push([key, scrubHeaderUrlValues(headersValue as Record<string, unknown>)])
    } else {
      result.push([key, value])
    }
  }
  return Object.fromEntries(result) as TRequest
}

function valueNeedsUrlScrubbing(value: unknown): boolean {
  const needsScrubbing = (item: string): boolean =>
    /[?#]/.test(item) ||
    /\/oncall\/integrations\/v1\/formatted_webhook\/[^/]+\/heartbeat\/?/.test(item)
  if (typeof value === 'string') return needsScrubbing(value)
  return (
    Array.isArray(value) && value.some(item => typeof item === 'string' && needsScrubbing(item))
  )
}

function sameEntries(
  original: Record<string, unknown>,
  candidate: Record<string, unknown>,
): boolean {
  const originalEntries = Object.entries(original)
  return (
    originalEntries.length === Object.keys(candidate).length &&
    originalEntries.every(
      ([key, value]) => Object.hasOwn(candidate, key) && candidate[key] === value,
    )
  )
}
