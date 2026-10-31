import type { PoolClient, TransactionQuery } from '@data-stores/psql/types'
import createHttpError from 'http-errors'

const SOURCE_TABLES = [
  'copyright_notices',
  'copyright_restrictions',
  'copyright_territorial_decision_identities',
  'copyright_territorial_redress_decision_identities',
  'copyright_territorial_notice_receipts',
  'copyright_territorial_decisions',
  'copyright_territorial_redress_requests',
  'copyright_territorial_redress_decisions',
  'copyright_eu_supervised_complaints',
  'copyright_territorial_escalations',
] as const

const MAX_ATTEMPTS = 3
const LOCK_WAIT = '500ms'

function lockUnavailable(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '55P03'
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error('EU report lock failed', { cause: value })
}

async function rollbackSavepoint(client: PoolClient, name: string): Promise<void> {
  await client.query(`/* rollbackEuReportSourceSavepoint */ ROLLBACK TO SAVEPOINT ${name}`)
  await client.query(`/* releaseEuReportSourceSavepoint */ RELEASE SAVEPOINT ${name}`)
}

async function tryLockAllSources(client: PoolClient): Promise<{
  contended: (typeof SOURCE_TABLES)[number] | null
  error: unknown
}> {
  await client.query('/* beginEuReportSourceAttempt */ SAVEPOINT eu_report_source_attempt')
  let contended: (typeof SOURCE_TABLES)[number] | null = null
  try {
    // These identifiers are fixed local literals. Each NOWAIT lock leaves no blocked cycle.
    for (const table of SOURCE_TABLES) {
      contended = table
      // oxlint-disable-next-line no-await-in-loop -- each NOWAIT lock must follow the preceding table lock on one client.
      await client.query(
        `/* tryLockEuReportSource_${table} */ LOCK TABLE ${table} IN SHARE MODE NOWAIT`,
      )
    }
    await client.query(
      '/* releaseEuReportSourceAttempt */ RELEASE SAVEPOINT eu_report_source_attempt',
    )
    return { contended: null, error: null }
  } catch (err) {
    await rollbackSavepoint(client, 'eu_report_source_attempt')
    if (!lockUnavailable(err)) throw asError(err)
    return { contended, error: err }
  }
}

async function waitForOneSource(
  client: PoolClient,
  table: (typeof SOURCE_TABLES)[number],
): Promise<unknown> {
  await client.query('/* beginEuReportSourceWait */ SAVEPOINT eu_report_source_wait')
  let error: unknown = null
  try {
    await client.query(`/* boundEuReportSourceWait */ SET LOCAL lock_timeout = '${LOCK_WAIT}'`)
    await client.query(`/* waitForEuReportSource */ LOCK TABLE ${table} IN SHARE MODE`)
  } catch (err) {
    error = err
  }
  // Release the single waited-for lock before attempting the complete fence again.
  await rollbackSavepoint(client, 'eu_report_source_wait')
  if (error !== null && !lockUnavailable(error)) throw asError(error)
  return error
}

/** Establish the full source fence before the first repeatable-read SELECT. */
export async function lockEuCopyrightTransparencySources(query: TransactionQuery): Promise<void> {
  // TransactionQuery becomes permanently failed after a caught SQL error; PostgreSQL savepoint
  // recovery must use its borrowed client. The caller has already started the transaction.
  const client = query.client
  let lastError: unknown = null
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // oxlint-disable-next-line no-await-in-loop -- each attempt must release partial locks before the next attempt.
    const result = await tryLockAllSources(client)
    if (result.contended === null) return
    // oxlint-disable-next-line no-await-in-loop -- wait for only the contended table with no other source locks held.
    lastError = (await waitForOneSource(client, result.contended)) ?? result.error
  }
  throw createHttpError(503, 'EU report sources are busy', { cause: lastError })
}
