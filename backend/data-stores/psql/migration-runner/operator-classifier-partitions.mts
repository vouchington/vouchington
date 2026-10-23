/* oxlint-disable no-await-in-loop -- each partition DDL step depends on the prior step on one transaction connection. */
import { beginBoundedTransaction } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import { getPartitionDropAgeRefusal } from './partition-drop-guard.mts'
import {
  parseClassifierPartitionRange,
  type ClassifierPartitionRangeInput,
} from './classifier-partition-range.mts'
import {
  allRangesAttached,
  assertAllRangesAttached,
  assertDefaultsFitRange,
  assertEveryDefaultAttached,
  CLASSIFIER_RESULT_TABLES as TABLES,
  lockClassifierResultParents,
  readClassifierChildren,
} from './classifier-partition-catalog.mts'

const CONNECTION_TIMEOUT_MS = 5_000
const STATEMENT_TIMEOUT_MS = 15_000

/** Reuse the three physical DEFAULT tables as one aligned range; never move immutable result rows. */
export async function createClassifierResultRange(
  input: ClassifierPartitionRangeInput,
): Promise<void> {
  const range = parseClassifierPartitionRange(input)
  const nextUtcDay = new Date()
  nextUtcDay.setUTCHours(24, 0, 0, 0)
  if (range.toDate > nextUtcDay) {
    throw new Error('Classifier result ranges cannot be created ahead of observed data')
  }
  await using transaction = await beginBoundedTransaction({
    connectionTimeoutMs: CONNECTION_TIMEOUT_MS,
    statementTimeoutMs: STATEMENT_TIMEOUT_MS,
  })
  await transaction(
    `/* createClassifierResultRange:lockBudget */ SET LOCAL lock_timeout = '2000ms'`,
  )
  await lockClassifierResultParents(transaction)
  const children = await readClassifierChildren(transaction, range.nameSuffix)
  if (allRangesAttached(children, range.nameSuffix, range.fromId, range.toId)) {
    assertEveryDefaultAttached(children)
    await transaction.commit()
    return
  }
  if (children.some(child => child.partition_name.endsWith(`__${range.nameSuffix}`))) {
    throw new Error('Classifier partition range is only partly attached')
  }
  assertEveryDefaultAttached(children)
  await assertDefaultsFitRange(transaction, range.fromId, range.toId, range.maxDefaultRows)

  // The candidate FK target stays unpartitioned. All DDL and FK validation commit together;
  // failure restores every DEFAULT without moving immutable result rows.
  for (const table of TABLES) {
    await transaction(`/* createClassifierResultRange:detach */
      ALTER TABLE ${table} DETACH PARTITION ${table}__default`)
  }
  for (const table of TABLES) {
    await transaction(`/* createClassifierResultRange:rename */
      ALTER TABLE ${table}__default RENAME TO ${table}__${range.nameSuffix}`)
  }
  for (const table of TABLES) {
    await transaction(`/* createClassifierResultRange:attach */
      ALTER TABLE ${table} ATTACH PARTITION ${table}__${range.nameSuffix}
      FOR VALUES FROM ('${range.fromId}') TO ('${range.toId}')`)
  }
  for (const table of TABLES) {
    await transaction(`/* createClassifierResultRange:newDefault */
      CREATE TABLE ${table}__default PARTITION OF ${table} DEFAULT`)
  }
  await transaction.commit()
}

/** Retire exactly three aligned result children after the merged partition guard and live-work checks. */
export async function retireClassifierResultRange(
  input: ClassifierPartitionRangeInput,
  minimumRetentionDays: number,
): Promise<void> {
  const range = parseClassifierPartitionRange(input)
  const policy = { minimumRetentionDays }
  const candidate = {
    table: TABLES[0]!,
    partition: `${TABLES[0]}__${range.nameSuffix}`,
    upperBound: range.toDate,
  }
  const preflightRefusal = getPartitionDropAgeRefusal(candidate, policy, new Date())
  if (preflightRefusal) {
    throw new Error(`Classifier result range retirement refused: ${preflightRefusal}`)
  }
  await using transaction = await beginBoundedTransaction({
    connectionTimeoutMs: CONNECTION_TIMEOUT_MS,
    statementTimeoutMs: STATEMENT_TIMEOUT_MS,
  })
  await guardAndRetireClassifierResultRange(transaction, input, minimumRetentionDays, new Date())
  await transaction.commit()
}

/** The caller owns the transaction, including rollback of any partial DDL on refusal. */
export async function guardAndRetireClassifierResultRange(
  query: QueryExecutor,
  input: ClassifierPartitionRangeInput,
  minimumRetentionDays: number,
  referenceDate: Date,
): Promise<void> {
  const range = parseClassifierPartitionRange(input)
  const policy = { minimumRetentionDays }
  const candidate = {
    table: TABLES[0]!,
    partition: `${TABLES[0]}__${range.nameSuffix}`,
    upperBound: range.toDate,
  }
  await query(`/* retireClassifierResultRange:lockBudget */ SET LOCAL lock_timeout = '2000ms'`)
  // Producer lock order differs between reservation and completion. Wait for result writers
  // first, then take producer-table locks with NOWAIT: a busy producer causes rollback rather
  // than a reverse wait edge. Once held, no batch/run can become pending during the probes.
  await lockClassifierResultParents(query)
  const children = await readClassifierChildren(query, range.nameSuffix)
  assertEveryDefaultAttached(children)
  const matching = children.filter(child => child.partition_name.endsWith(`__${range.nameSuffix}`))
  if (matching.length === 0) return
  assertAllRangesAttached(children, range.nameSuffix, range.fromId, range.toId)
  for (const table of TABLES) {
    // no-mistakes-disable-next-line query-reached-per-item: exactly three fixed result children require serial ACCESS EXCLUSIVE locks in deterministic order on this transaction client.
    await query(`/* retireClassifierResultRange:lockChild */
      LOCK TABLE ${table}__${range.nameSuffix} IN ACCESS EXCLUSIVE MODE`)
  }
  await query(`/* retireClassifierResultRange:lockRuns */
    LOCK TABLE classifier_runs IN SHARE MODE NOWAIT`)
  await query(`/* retireClassifierResultRange:lockBatches */
    LOCK TABLE classifier_decision_batches IN SHARE MODE NOWAIT`)
  // All relevant producers are fenced before the final age, catalog and pending-work checks.
  const lockedChildren = await readClassifierChildren(query, range.nameSuffix)
  assertEveryDefaultAttached(lockedChildren)
  assertAllRangesAttached(lockedChildren, range.nameSuffix, range.fromId, range.toId)
  const ageRefusal = getPartitionDropAgeRefusal(candidate, policy, referenceDate)
  if (ageRefusal) throw new Error(`Classifier result range retirement refused: ${ageRefusal}`)
  await assertNoPendingClassifierWork(query, range.fromId, range.toId)
  // No CASCADE: an unexpected inbound FK makes the transaction fail and leaves every child attached.
  for (const table of TABLES) {
    // no-mistakes-disable-next-line query-reached-per-item: exactly three catalog-validated child detaches run serially in this guarded DDL transaction.
    await query(`/* retireClassifierResultRange:detach */
      ALTER TABLE ${table} DETACH PARTITION ${table}__${range.nameSuffix}`)
  }
  for (const table of TABLES) {
    // no-mistakes-disable-next-line query-reached-per-item: exactly three detached children are dropped serially so one failure rolls back the whole guarded transaction.
    await query(`/* retireClassifierResultRange:drop */ DROP TABLE ${table}__${range.nameSuffix}`)
  }
}

async function assertNoPendingClassifierWork(
  query: QueryExecutor,
  fromId: string,
  toId: string,
): Promise<void> {
  const batches = await query(
    `/* assertNoPendingClassifierWork:batches */
      SELECT 1 FROM classifier_decision_batches
      WHERE id >= $1::uuid AND id < $2::uuid AND completed_at IS NULL LIMIT 1`,
    [fromId, toId],
  )
  if (batches.rows.length > 0) throw new Error('Classifier result range has incomplete batches')
  const runs = await query(
    `/* assertNoPendingClassifierWork:runs */
      SELECT 1 FROM classifier_runs
      WHERE decision_batch_id IS NOT NULL
        AND decision_batch_id >= $1::uuid AND decision_batch_id < $2::uuid
        AND completed_at IS NULL AND superseded_at IS NULL AND terminal_failed_at IS NULL
      LIMIT 1`,
    [fromId, toId],
  )
  if (runs.rows.length > 0) throw new Error('Classifier result range has pending runs')
  // Calls have no separate completion state. Batch completion fences every call in this range.
}
