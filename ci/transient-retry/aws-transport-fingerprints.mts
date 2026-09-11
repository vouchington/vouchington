// Callers anchor to their own consumer's terminal failure marker first, then call this on
// that anchored slice — it only OR-matches the transport-cause vocabulary, not job scope.
// Shared by AWS-facing consumers and the gh-api helper. AWS CLI-only markers stay below.
export const GO_NET_HTTP_TRANSPORT_TRANSIENT_ERROR_MARKERS = [
  'net/http: TLS handshake timeout',
  'net/http: timeout awaiting response headers',
  'connection reset by peer',
  'unexpected EOF',
  'i/o timeout',
] as const

const AWS_TRANSPORT_TRANSIENT_ERROR_MARKERS = [
  ...GO_NET_HTTP_TRANSPORT_TRANSIENT_ERROR_MARKERS,
  'context deadline exceeded',
  'Connection was closed before we received a valid response from endpoint URL',
] as const

export function hasAwsTransportTransientError(text: string): boolean {
  return AWS_TRANSPORT_TRANSIENT_ERROR_MARKERS.some(marker => text.includes(marker))
}
