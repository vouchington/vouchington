import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import {
  advisoryLockPool,
  beginBoundedTransaction,
  beginTransaction,
} from '@data-stores/psql/setup'

import { TEST_STATEMENT_TIMEOUT_MS } from '../../statement-timeout-constant.mts'

export { TEST_STATEMENT_TIMEOUT_MS }

type PoolQuery = typeof read

/**
 * `read` and `write` are separate pools; check each owned session explicitly.
 */
export async function getSessionStatementTimeout(query: PoolQuery = read): Promise<number> {
  // pg_settings.setting reports the raw base-unit (ms) integer as text. current_setting() /
  // SHOW apply "friendliest unit" formatting instead (verified empirically: 20000ms round-trips
  // as "20s", 750ms as "750ms", 20003ms as "20003ms") — parseInt on that output silently
  // truncates round values ("20s" -> 20, not 20000), so it cannot be used here.
  const { rows } = await query(`SELECT setting FROM pg_settings WHERE name = 'statement_timeout'`)
  return Number.parseInt(rows[0].setting, 10)
}

export function getReadPoolStatementTimeout(): Promise<number> {
  return getSessionStatementTimeout(read)
}

export function getWritePoolStatementTimeout(): Promise<number> {
  return getSessionStatementTimeout(write)
}

export async function runStatementTimeoutAttributionProbe(): Promise<void> {
  const lockKey = randomUUID()
  // Hold on the primary advisory-lock pool so a write-pool size of one still leaves a
  // connection for the timed query. The read pool may point at a separate replica.
  await using holder = await beginTransaction({ client: advisoryLockPool })
  await holder(
    '/* holdStatementTimeoutProbe */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [lockKey],
  )
  await using transaction = await beginBoundedTransaction({
    connectionTimeoutMs: 10_000,
    statementTimeoutMs: 750,
  })
  await transaction(
    '/* guardStatementTimeoutProbe */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [lockKey],
  )
  await transaction.commit()
}
