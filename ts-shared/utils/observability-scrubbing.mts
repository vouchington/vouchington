// Grafana heartbeat bearer credentials occupy a path segment rather than a query parameter.
export function redactObservabilityUrl(value: string): string {
  return value.replace(
    /(\/oncall\/integrations\/v1\/formatted_webhook\/)[^/]+(\/heartbeat\/?)/,
    '$1[REDACTED]$2',
  )
}
