/* oxlint-disable no-await-in-loop -- each partition DDL step depends on the prior step on one transaction connection. */
import { beginBoundedTransaction } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import { getPartitionDropAgeRefusal } from './partition-drop-guard.mts'
import { assertNoPendingClassifierWork } from './classifier-partition-pending-work.mts'
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
  lockClassifierResultFkTargets,
  lockClassifierResultParents,
  readClassifierChildren,
} from './classifier-partition-catalog.mts'

const CONNECTION_TIMEOUT_MS = 5_000
const STATEMENT_TIMEOUT_MS = 15_000
const CANDIDATE_TABLE = 'classifier_decision_batch_candidates'
const CANDIDATE_REFERENCING_TABLES = [
  'topic_classifier_results',
  'story_classifier_results',
] as const

function candidateFirst(): string[] {
  return [CANDIDATE_TABLE, ...TABLES.filter(table => table !== CANDIDATE_TABLE)]
}

/** A detached result child has an independent FK copy that would pin the candidate child. */
async function releaseDetachedCandidateReferences(
  query: QueryExecutor,
  table: string,
  child: string,
) {
  if (!CANDIDATE_REFERENCING_TABLES.some(candidateTable => candidateTable === table)) return
  await query(`/* releaseDetachedCandidateReferences */
    ALTER TABLE ${child} DROP CONSTRAINT fk_${table}__batch_candidate`)
}

/** Reuse the four physical DEFAULT tables as one aligned range; never move immutable rows. */
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
  await guardAndCreateClassifierResultRange(transaction, input, new Date())
  await transaction.commit()
}

/** The caller owns the transaction, so a failed seal rolls back every partition change. */
export async function guardAndCreateClassifierResultRange(
  query: QueryExecutor,
  input: ClassifierPartitionRangeInput,
  referenceDate: Date,
): Promise<void> {
  const range = parseClassifierPartitionRange(input)
  const nextUtcDay = new Date(referenceDate)
  nextUtcDay.setUTCHours(24, 0, 0, 0)
  if (range.toDate > nextUtcDay) {
    throw new Error('Classifier result ranges cannot be created ahead of observed data')
  }
  // ast-grep-ignore: no-three-sequential-awaits -- set the lock budget, then lock result parents, then inspect child catalog on this transaction client
  await query(`/* createClassifierResultRange:lockBudget */ SET LOCAL lock_timeout = '2000ms'`)
  await lockClassifierResultFkTargets(query)
  await lockClassifierResultParents(query)
  const children = await readClassifierChildren(query, range.nameSuffix)
  if (allRangesAttached(children, range.nameSuffix, range.fromId, range.toId)) {
    assertEveryDefaultAttached(children)
    return
  }
  if (children.some(child => child.partition_name.endsWith(`__${range.nameSuffix}`))) {
    throw new Error('Classifier partition range is only partly attached')
  }
  assertEveryDefaultAttached(children)
  await assertDefaultsFitRange(query, range.fromId, range.toId, range.maxDefaultRows)

  // All DDL and FK validation commit together; failure restores every DEFAULT.
  for (const table of TABLES) {
    // no-mistakes-disable-next-line query-reached-per-item: exactly four catalog-validated DEFAULT children detach serially within one transaction before their names can change.
    await query(`/* createClassifierResultRange:detach */
      ALTER TABLE ${table} DETACH PARTITION ${table}__default`)
    // Reattaching the child reinstalls the parent's validated FK in this transaction.
    // no-mistakes-disable-next-line query-reached-per-item: at most four fixed catalog-validated children must release detached FK copies serially on this DDL transaction.
    await releaseDetachedCandidateReferences(query, table, `${table}__default`)
  }
  for (const table of TABLES) {
    // no-mistakes-disable-next-line query-reached-per-item: exactly four detached DEFAULT children are renamed serially before any range is attached.
    await query(`/* createClassifierResultRange:rename */
      ALTER TABLE ${table}__default RENAME TO ${table}__${range.nameSuffix}`)
  }
  for (const table of candidateFirst()) {
    // no-mistakes-disable-next-line query-reached-per-item: exactly four renamed children attach in one DDL transaction after all original DEFAULT children are detached.
    await query(`/* createClassifierResultRange:attach */
      ALTER TABLE ${table} ATTACH PARTITION ${table}__${range.nameSuffix}
      FOR VALUES FROM ('${range.fromId}') TO ('${range.toId}')`)
  }
  for (const table of TABLES) {
    // no-mistakes-disable-next-line query-reached-per-item: exactly four new DEFAULT children are created serially after all range attachments in the same transaction.
    await query(`/* createClassifierResultRange:newDefault */
      CREATE TABLE ${table}__default PARTITION OF ${table} DEFAULT`)
  }
}

/** Retire exactly four aligned children after the merged partition guard and live-work checks. */
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
  await lockClassifierResultFkTargets(query)
  await lockClassifierResultParents(query)
  const children = await readClassifierChildren(query, range.nameSuffix)
  assertEveryDefaultAttached(children)
  const matching = children.filter(child => child.partition_name.endsWith(`__${range.nameSuffix}`))
  if (matching.length === 0) return
  assertAllRangesAttached(children, range.nameSuffix, range.fromId, range.toId)
  for (const table of TABLES) {
    // no-mistakes-disable-next-line query-reached-per-item: exactly four fixed children require serial ACCESS EXCLUSIVE locks in deterministic order on this transaction client.
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
    // no-mistakes-disable-next-line query-reached-per-item: exactly four catalog-validated child detaches run serially in this guarded DDL transaction.
    await query(`/* retireClassifierResultRange:detach */
      ALTER TABLE ${table} DETACH PARTITION ${table}__${range.nameSuffix}`)
    // no-mistakes-disable-next-line query-reached-per-item: at most four fixed catalog-validated children must release detached FK copies serially on this DDL transaction.
    await releaseDetachedCandidateReferences(query, table, `${table}__${range.nameSuffix}`)
  }
  for (const table of TABLES) {
    // no-mistakes-disable-next-line query-reached-per-item: exactly four detached children are dropped serially so one failure rolls back the whole guarded transaction.
    await query(`/* retireClassifierResultRange:drop */ DROP TABLE ${table}__${range.nameSuffix}`)
  }
}
