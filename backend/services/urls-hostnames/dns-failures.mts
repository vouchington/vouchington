import { write } from '@data-stores/psql'
import onError from '@modules/on-error'
import { resolveDnsCanary } from '@services/urls-hostnames/dns-canary'

const MAX_CONSECUTIVE_DNS_FAILURES = 3

/**
 * Records a DNS lookup failure for the given hostname. Before incrementing the counter,
 * performs a canary DNS lookup to verify that our own resolver is functional. If the canary
 * also fails, the error is logged but the counter is left unchanged — the failure is on our
 * side, not the target host's.
 *
 * Counter semantics:
 * - If last_dns_failure_at is NULL or older than 7 days, the counter resets to 1 (stale
 *   failures should not compound with new ones).
 * - Otherwise the counter is incremented.
 * - When the counter reaches MAX_CONSECUTIVE_DNS_FAILURES, crawlable is set to FALSE and
 *   dns_disabled_at is stamped. The hostname stays disabled until an admin clears it.
 */
export async function recordHostnameDnsFailure(
  hostnameId: string,
  resolveCanary: () => Promise<void> = resolveDnsCanary,
): Promise<void> {
  try {
    await resolveCanary()
  } catch (canaryError) {
    // Our own DNS resolver appears to be down. Do not penalise the target host.
    onError(
      new Error('DNS canary lookup failed — skipping hostname DNS failure counter increment', {
        cause: canaryError instanceof Error ? canaryError : undefined,
      }),
    )
    return
  }

  await recordHostnameConfigurationFailure(hostnameId)
}

/**
 * Records a target-hostname configuration failure without running the DNS canary.
 * Use this for failures that prove the target hostname is misconfigured but do not
 * depend on our resolver health, such as TLS certificate hostname mismatches.
 */
export async function recordHostnameConfigurationFailure(hostnameId: string): Promise<void> {
  // Single atomic UPDATE — avoids the CTE lost-update race where two concurrent transactions
  // both read the same pre-update value and write identical incremented values.
  // PostgreSQL locks the row at UPDATE time, so the right-hand CASE expressions always evaluate
  // against the latest committed row values.
  await write(
    `/* recordHostnameConfigurationFailure */
    UPDATE url_hostnames SET
      consecutive_dns_failures = CASE
        WHEN last_dns_failure_at IS NULL
          OR last_dns_failure_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
        THEN 1
        ELSE consecutive_dns_failures + 1
      END,
      last_dns_failure_at = CURRENT_TIMESTAMP,
      crawlable = CASE
        WHEN CASE
          WHEN last_dns_failure_at IS NULL
            OR last_dns_failure_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
          THEN 1
          ELSE consecutive_dns_failures + 1
        END >= $2 THEN FALSE
        ELSE crawlable
      END,
      dns_disabled_at = CASE
        WHEN CASE
          WHEN last_dns_failure_at IS NULL
            OR last_dns_failure_at < CURRENT_TIMESTAMP - INTERVAL '7 days'
          THEN 1
          ELSE consecutive_dns_failures + 1
        END >= $2 AND dns_disabled_at IS NULL
        THEN CURRENT_TIMESTAMP
        ELSE dns_disabled_at
      END
    WHERE id = $1
  `,
    [hostnameId, MAX_CONSECUTIVE_DNS_FAILURES],
  )
}

/**
 * Resets the DNS failure counter for the given hostname after a successful crawl.
 * Uses a conditional update so no write is issued when the counter is already zero.
 */
export async function resetHostnameDnsFailures(hostnameId: string): Promise<void> {
  await write(
    `/* resetHostnameDnsFailures */
    UPDATE url_hostnames
    SET consecutive_dns_failures = 0
    WHERE id = $1
      AND consecutive_dns_failures > 0
  `,
    [hostnameId],
  )
}
