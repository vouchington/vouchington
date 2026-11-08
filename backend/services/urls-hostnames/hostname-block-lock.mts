/** Shared lock-table budget. PostgreSQL sizes that table as max_locks_per_transaction
 * (64 by default) times max_connections. A projection prefix locks this many stripes,
 * not one key per hostname and parent suffix. This module lives in urls-hostnames so
 * hostname ownership can take the same stripes. Hostname blocking already depends here.
 */
const HOSTNAME_BLOCK_LOCK_STRIPES = 64

/** Keeps stripe keys out of the bare-hostname-id advisory lock space. */
const HOSTNAME_BLOCK_LOCK_STRIPE_NAMESPACE = 'hostname-block-stripe:'

/** Stripe of one hostname id. `idSql` is a trusted SQL expression, never a value. */
function hostnameBlockLockStripeSql(idSql: string): string {
  return `((hashtext((${idSql})::text) & 2147483647) % ${HOSTNAME_BLOCK_LOCK_STRIPES})`
}

/** Advisory lock for one hostname id's stripe. Block and projection use the same key. */
export function hostnameBlockStripeAdvisoryLock(idSql: string): string {
  return `pg_advisory_xact_lock(hashtextextended('${HOSTNAME_BLOCK_LOCK_STRIPE_NAMESPACE}' || ${hostnameBlockLockStripeSql(idSql)}::text, 0))`
}

/** Distinct stripe locks for a set of hostname ids, taken in stripe order. */
export function hostnameBlockStripeSetLockSql(sourceSql: string, idSql: string): string {
  return `SELECT pg_advisory_xact_lock(hashtextextended('${HOSTNAME_BLOCK_LOCK_STRIPE_NAMESPACE}' || stripes.stripe::text, 0))
      FROM (
        SELECT DISTINCT ${hostnameBlockLockStripeSql(idSql)} AS stripe
        FROM ${sourceSql}
      ) stripes
      ORDER BY stripes.stripe`
}
