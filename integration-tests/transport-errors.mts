function collectErrorCodes(error: unknown, codes: Set<string>, depth = 0): void {
  if (depth > 6 || error === null || typeof error !== 'object') return

  const code = (error as { code?: unknown }).code
  if (typeof code === 'string') codes.add(code)

  // AggregateError.errors -- undici raises one of these for a dual-stack ::1/127.0.0.1 connection
  // refusal, so a plain .cause walk alone can miss the code.
  const errors = (error as { errors?: unknown }).errors
  if (Array.isArray(errors)) {
    for (const inner of errors) collectErrorCodes(inner, codes, depth + 1)
  }

  const cause = (error as { cause?: unknown }).cause
  if (cause !== undefined) collectErrorCodes(cause, codes, depth + 1)
}

// Walks error.cause (and nested AggregateError.errors) for a transport error code and decides
// whether fetchWithTransportRetry should try again. `idempotent` is the caller's resolved decision
// -- either the HTTP method is naturally idempotent, or the caller explicitly opted in because the
// call is idempotent in effect (see WebIntegrationClient.logout()).
export function isRetryableTransportError(error: unknown, idempotent: boolean): boolean {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    // The caller's own timeout budget expiring is authoritative, not a transport failure.
    return false
  }

  const codes = new Set<string>()
  collectErrorCodes(error, codes)

  // Connection never established: the request was definitively never delivered, so retrying is
  // safe regardless of method.
  if (codes.has('ECONNREFUSED')) return true

  // The request may already have reached the server by the time the socket dropped -- only safe to
  // retry blindly when the call is idempotent.
  if (idempotent && (codes.has('UND_ERR_SOCKET') || codes.has('ECONNRESET'))) return true

  return false
}
