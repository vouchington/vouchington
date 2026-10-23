import {
  scrubBreadcrumbs,
  scrubRequestUrlFields as scrubRequestUrls,
  scrubSpanUrlAttributes as scrubSpanUrls,
} from '@vouchington/utils/observability'

// Grafana heartbeat bearer credentials occupy a path segment rather than a query parameter.
export function redactObservabilityUrl(value: string): string {
  return value.replace(
    /(\/oncall\/integrations\/v1\/formatted_webhook\/)[^/]+(\/heartbeat\/?)/,
    '$1[REDACTED]$2',
  )
}
const URL_OPTIONS = { credentialHeaders: [], redactUrl: redactObservabilityUrl }

export function scrubSpanUrlAttributes<T extends Record<string, unknown>>(data: T): T {
  return scrubSpanUrls(data, URL_OPTIONS)
}
export function scrubEventBreadcrumbs<T extends { data?: Record<string, unknown> }>(
  breadcrumbs: T[] | undefined,
): T[] | undefined {
  return scrubBreadcrumbs(breadcrumbs, URL_OPTIONS)
}
export function scrubRequestUrlFields<T extends object>(request: T | undefined): T | undefined {
  return scrubRequestUrls(request, URL_OPTIONS)
}
