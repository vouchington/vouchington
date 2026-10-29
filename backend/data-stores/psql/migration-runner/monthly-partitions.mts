import onError from '@modules/on-error'
import {
  assertSafeSqlIdentifier,
  buildMonthlyPartitionName,
  createMonthlyPartitions as createPlatformMonthlyPartitions,
} from '@vouchington/postgres/partitions'
import { ALL_MONTHLY_PARTITION_TABLES } from '../config-driven/utils/partition-config.mts'
import { PARTITION_DROP_POLICIES } from '../config-driven/utils/partition-drop-policies.mts'
import { beginTransaction, write } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import { guardAndRetireMonthlyPartition } from './guard-and-retire-monthly-partition.mts'
import {
  getPartitionDropAgeRefusal,
  type PartitionDropCandidate,
  type PartitionDropRefusal,
} from './partition-drop-guard.mts'
import {
  listMonthlyDropCandidates,
  type PartitionCleanupCursor,
} from './monthly-partition-candidates.mts'

export type PartitionDropOutcome = {
  table: string
  partition: string
  outcome: 'dropped' | 'refused'
  reason?: PartitionDropRefusal | 'lock-contention' | 'retirement-error'
}

export type PartitionCleanupPage = {
  outcomes: PartitionDropOutcome[]
  hasMore: boolean
  nextCursor?: PartitionCleanupCursor
}

const DEFAULT_PARTITION_CLEANUP_LIMIT = 5

export async function createMonthlyPartitions(writer: QueryExecutor = write): Promise<void> {
  await createPlatformMonthlyPartitions(writer, { tables: ALL_MONTHLY_PARTITION_TABLES })
}

export async function cleanupPartitions(
  referenceDate: Date,
  options: {
    feedbackBatchSize: number
    limit?: number
    after?: PartitionCleanupCursor
    query?: QueryExecutor
    /** A fold knows its completed month, so its continuation checks only that attached child. */
    target?: { table: string; monthStart: Date }
  },
): Promise<PartitionCleanupPage> {
  if (options.target) {
    const candidates = await listAttachedMonthlyDropCandidate(
      options.target.table,
      options.target.monthStart,
      options.query ?? write,
    )
    const outcomes = await retireMonthlyDropCandidates(
      candidates,
      referenceDate,
      options.feedbackBatchSize,
    )
    return { outcomes, hasMore: false }
  }
  const page = await listMonthlyDropCandidates(
    options.query ?? write,
    options.limit ?? DEFAULT_PARTITION_CLEANUP_LIMIT,
    options.after,
  )
  const outcomes = await retireMonthlyDropCandidates(
    page.candidates,
    referenceDate,
    options.feedbackBatchSize,
  )
  for (const outcome of outcomes) console.info('Partition cleanup:', outcome)
  return { outcomes, hasMore: page.hasMore, nextCursor: page.nextCursor }
}

async function listAttachedMonthlyDropCandidate(
  table: string,
  monthStart: Date,
  query: QueryExecutor,
): Promise<PartitionDropCandidate[]> {
  if (!ALL_MONTHLY_PARTITION_TABLES.some(config => config.table === table)) {
    throw new Error(`Not a managed monthly partition parent: ${table}`)
  }
  const safeTable = assertSafeSqlIdentifier(table)
  const partition = assertSafeSqlIdentifier(
    buildMonthlyPartitionName(table, monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1),
  )
  const { rows } = await query<{ attached: boolean }>(
    `/* listAttachedMonthlyDropCandidate */
      SELECT EXISTS (
        SELECT 1 FROM pg_inherits AS inheritance
        JOIN pg_class AS parent ON parent.oid = inheritance.inhparent
        JOIN pg_namespace AS namespace ON namespace.oid = parent.relnamespace
        WHERE inheritance.inhparent = to_regclass($1)
          AND inheritance.inhrelid = to_regclass($2)
          AND namespace.nspname = current_schema()
        LIMIT 1
      ) AS attached`,
    [safeTable, partition],
  )
  return rows[0]?.attached
    ? [
        {
          table,
          partition,
          upperBound: new Date(
            Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
          ),
        },
      ]
    : []
}

/** One clearance partition per page bounds the feedback references cleared across candidates. */
export async function retireMonthlyDropCandidates(
  candidates: readonly PartitionDropCandidate[],
  referenceDate: Date,
  feedbackBatchSize: number,
  retireOne: (candidate: PartitionDropCandidate) => Promise<PartitionDropOutcome> = candidate =>
    retireMonthlyPartitionCandidate(candidate, referenceDate, feedbackBatchSize),
): Promise<PartitionDropOutcome[]> {
  let clearanceBatchUsed = false
  return retirePartitionsSequentially(candidates, async candidate => {
    const eligibleClearance =
      candidate.table === 'post_clearance_changes' &&
      !getPartitionDropAgeRefusal(
        candidate,
        PARTITION_DROP_POLICIES[candidate.table],
        referenceDate,
      )
    if (eligibleClearance && clearanceBatchUsed) {
      return {
        table: candidate.table,
        partition: candidate.partition,
        outcome: 'refused',
        reason: 'feedback-references-pending',
      }
    }
    const outcome = await retireOne(candidate)
    // An error may occur after the bounded update and roll back. Conservatively stop this page.
    if (
      eligibleClearance &&
      (outcome.outcome === 'dropped' ||
        outcome.reason === 'feedback-references-pending' ||
        outcome.reason === 'retirement-error')
    )
      clearanceBatchUsed = true
    return outcome
  })
}

/** Retire one child transaction at a time; the next child starts only after the last settles. */
export async function retirePartitionsSequentially(
  candidates: readonly PartitionDropCandidate[],
  retireOne: (candidate: PartitionDropCandidate) => Promise<PartitionDropOutcome>,
): Promise<PartitionDropOutcome[]> {
  return candidates.reduce(
    async (previous, candidate) => {
      const outcomes = await previous
      outcomes.push(await retireOne(candidate))
      return outcomes
    },
    Promise.resolve([] as PartitionDropOutcome[]),
  )
}

/** Retire one discovered monthly child; callers may inspect a refusal without sweeping siblings. */
export async function retireMonthlyPartitionCandidate(
  candidate: PartitionDropCandidate,
  referenceDate: Date,
  feedbackBatchSize: number,
  begin: typeof beginTransaction = beginTransaction,
): Promise<PartitionDropOutcome> {
  const base = { table: candidate.table, partition: candidate.partition }
  const policy = PARTITION_DROP_POLICIES[candidate.table]
  const preflightReason = getPartitionDropAgeRefusal(candidate, policy, referenceDate)
  if (preflightReason) return { ...base, outcome: 'refused', reason: preflightReason }
  try {
    await using transaction = await begin()
    const reason = await guardAndRetireMonthlyPartition(
      transaction,
      candidate,
      policy,
      referenceDate,
      feedbackBatchSize,
    )
    if (reason) {
      if (reason === 'feedback-references-pending') await transaction.commit()
      return { ...base, outcome: 'refused', reason }
    }
    await transaction.commit()
    return { ...base, outcome: 'dropped' }
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === '55P03') {
      return { ...base, outcome: 'refused', reason: 'lock-contention' }
    }
    onError(new Error(`Failed to retire partition ${candidate.partition}`, { cause: err }))
    return { ...base, outcome: 'refused', reason: 'retirement-error' }
  }
}
