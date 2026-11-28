import { write } from '@data-stores/psql'

/**
 * Persists a hostname's rate-limit expiry so dispatchers skip it until the lock expires.
 * Never shortens a longer rate-limit window already stored on the row.
 */
export async function recordHostnameRateLimitUntil(
  hostnameId: string,
  lockMs: number,
): Promise<void> {
  if (!Number.isFinite(lockMs) || lockMs <= 0) return
  const boundedMs = Math.ceil(lockMs)
  await write(
    `/* recordHostnameRateLimitUntil */
    UPDATE url_hostnames
    SET rate_limited_until = GREATEST(
      COALESCE(rate_limited_until, '-infinity'::timestamptz),
      CURRENT_TIMESTAMP + ($2::bigint * INTERVAL '1 millisecond')
    )
    WHERE id = $1`,
    [hostnameId, boundedMs],
  )
}
