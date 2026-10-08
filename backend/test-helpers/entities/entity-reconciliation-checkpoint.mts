import { deepStrictEqual } from 'node:assert'
import {
  beginTransaction,
  write,
  type QueryOptions,
  type OwnedTransaction,
} from '@data-stores/psql'
import { acquireTestPostgresAdvisoryLock } from '../postgres-advisory-lock.mts'

type Checkpoint = { reconciled_through_at: string; updated_at: string }
const checkpointSql = `/* readTestEntityReconciliationCheckpoint */
  SELECT reconciled_through_at::text, updated_at::text
  FROM entity_listener_reconciliation_cursors WHERE is_singleton`

/** Runs genuine checkpoint operations under a row reservation, then verifies durable rollback. */
export async function withTestEntityReconciliationCheckpoint<Result>(
  handler: (options: QueryOptions) => Promise<Result>,
): Promise<Result> {
  const lock = await acquireTestPostgresAdvisoryLock({
    namespace: 2_135_043,
    key: 1,
    timeout: '20s',
  })
  let transaction: OwnedTransaction | undefined
  let before: Checkpoint[] | undefined
  let outcome: { ok: true; value: Result } | { ok: false; error: unknown }
  const cleanupErrors: unknown[] = []
  try {
    transaction = await beginTransaction()
    before = (await transaction<Checkpoint>(`${checkpointSql} FOR UPDATE`)).rows
    if (before.length === 0) {
      await transaction(
        `/* reserveTestEntityReconciliationCheckpoint */
        INSERT INTO entity_listener_reconciliation_cursors (is_singleton, reconciled_through_at)
        VALUES (TRUE, $1) ON CONFLICT (is_singleton) DO UPDATE
        SET reconciled_through_at = entity_listener_reconciliation_cursors.reconciled_through_at
      `,
        [new Date(0)],
      )
    }
    outcome = { ok: true, value: await handler({ query: transaction }) }
  } catch (err) {
    outcome = { ok: false, error: err }
  } finally {
    if (transaction) {
      try {
        await transaction.rollback()
      } catch (err) {
        cleanupErrors.push(err)
      }
      try {
        await transaction[Symbol.asyncDispose]()
      } catch (err) {
        cleanupErrors.push(err)
      }
    }
    if (before) {
      try {
        const after = await write<Checkpoint>(checkpointSql)
        deepStrictEqual(after.rows, before)
      } catch (err) {
        cleanupErrors.push(err)
      }
    }
    try {
      await lock.release()
    } catch (err) {
      cleanupErrors.push(err)
    }
  }
  const errors = cleanupErrors.filter(
    (error, index, all) =>
      all.findIndex(other => Object.is(other, error)) === index &&
      (outcome.ok || !Object.is(error, outcome.error)),
  )
  if (errors.length > 0) {
    throw new AggregateError(
      outcome.ok ? errors : [outcome.error, ...errors],
      'Entity reconciliation checkpoint reservation failed',
    )
  }
  if (!outcome.ok) throw outcome.error
  return outcome.value
}
