/**
 * Strips every occurrence of a secret token — both its raw form and the
 * `URLSearchParams`-encoded form actually appended to the connect URL (which differs from
 * `encodeURIComponent`, e.g. space becomes `+` not `%20`) — out of an error message.
 */
export function redactToken(message: string, token: string): string {
  if (!token) return message
  const encodedToken = new URLSearchParams({ token }).toString().slice('token='.length)
  let redacted = message.replaceAll(token, '[REDACTED]')
  if (encodedToken !== token) redacted = redacted.replaceAll(encodedToken, '[REDACTED]')
  return redacted
}

/**
 * Rebuilds an error with the token redacted from its message and stack, recursing through
 * `.cause` — the connect failure's underlying driver/networking error can put the token-bearing
 * URL in a nested cause's message or stack, not just the top-level message. A `.cause` that is
 * neither an `Error` nor a `string` is dropped rather than preserved as-is: its shape is unknown,
 * so it can't be safely searched for the token, and passing it through unredacted could leak the
 * token via a structured (e.g. driver-specific) cause object.
 */
export function redactTokenFromError(error: Error, token: string): Error {
  const redacted = new Error(redactToken(error.message, token), {
    cause:
      error.cause instanceof Error
        ? redactTokenFromError(error.cause, token)
        : typeof error.cause === 'string'
          ? redactToken(error.cause, token)
          : undefined,
  })
  redacted.name = error.name
  if (error.stack) redacted.stack = redactToken(error.stack, token)
  return redacted
}
