/** RFC 8252 loopback registrations omit the ephemeral port. All other URI parts stay exact. */
export function matchesRegisteredRedirectUri(
  requestedUri: string,
  registeredUris: readonly string[],
): boolean {
  if (registeredUris.includes(requestedUri)) return true
  const requested = /^http:\/\/(127\.0\.0\.1|\[::1\]):([0-9]+)([/?].*)?$/u.exec(requestedUri)
  if (!requested) return false
  const port = Number(requested[2])
  if (port > 65_535) return false
  return registeredUris.includes(`http://${requested[1]}${requested[3] ?? ''}`)
}
