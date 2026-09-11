// Converts a duration option ('permanent' | '<days>') to an ISO expiry, or undefined for permanent.
export function durationToExpiresAt(duration: string, now: Date = new Date()): string | undefined {
  if (duration === 'permanent') return undefined
  const days = parseInt(duration, 10)
  const expires = new Date(now)
  expires.setDate(expires.getDate() + days)
  return expires.toISOString()
}
