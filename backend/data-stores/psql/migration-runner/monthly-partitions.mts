import onError from '@modules/on-error'
import {
  assertSafeSqlIdentifier,
  parseMonthlyPartitionName,
  retireMonthlyPartition,
  createMonthlyPartitions as createPlatformMonthlyPartitions,
} from '@vouchington/postgres/partitions'
import {
  ALL_MONTHLY_PARTITION_TABLES,
  PARTITION_DROP_POLICIES,
  type PartitionDropPolicy,
} from '../config-driven/utils/partition-config.mts'
import { beginTransaction, write } from '../setup.mts'
import type { QueryExecutor } from '../types.mts'
import { beforeRetireMonthlyPartition } from './before-retire-monthly-partition.mts'
import {
  getPartitionDropAgeRefusal,
  getPartitionDropRefusal,
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
  reason?: PartitionDropRefusal | 'retirement-error'
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
  referenceDate: Date = new Date(),
  options: { limit?: number; after?: PartitionCleanupCursor; query?: QueryExecutor } = {},
): Promise<PartitionCleanupPage> {
  const page = await listMonthlyDropCandidates(
    options.query ?? write,
    options.limit ?? DEFAULT_PARTITION_CLEANUP_LIMIT,
    options.after,
  )
  const outcomes = await retirePartitionsSequentially(page.candidates, candidate =>
    retireMonthlyPartitionCandidate(candidate, referenceDate),
  )
  for (const outcome of outcomes) console.info('Partition cleanup:', outcome)
  return { outcomes, hasMore: page.hasMore, nextCursor: page.nextCursor }
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
    )
    if (reason) return { ...base, outcome: 'refused', reason }
    await transaction.commit()
    return { ...base, outcome: 'dropped' }
  } catch (err) {
    onError(new Error(`Failed to retire partition ${candidate.partition}`, { cause: err }))
    return { ...base, outcome: 'refused', reason: 'retirement-error' }
  }
}

/** The caller owns the transaction and commits only after this guarded detach succeeds. */
export async function guardAndRetireMonthlyPartition(
  transaction: QueryExecutor,
  candidate: PartitionDropCandidate,
  policy: PartitionDropPolicy | undefined,
  referenceDate: Date,
): Promise<PartitionDropRefusal | null> {
  const table = assertSafeSqlIdentifier(candidate.table)
  const partition = assertSafeSqlIdentifier(candidate.partition)
  // Party writers update this generation before appending history. Fence them first so the
  // final hold probe cannot miss an already-held account newly joining a case.
  if (policy?.copyrightHistory) {
    await transaction(
      '/* cleanupPartitions:lockCopyrightParties */ LOCK TABLE copyright_notice_thread_party_generations IN SHARE MODE',
    )
  }
  // FK teardown during DETACH/DROP touches referenced tables. Acquire their final lock modes
  // without waiting, before holding the history parent, so a topic writer cannot invert the order.
  const retirementReferences = policy?.retirementReferenceTables ?? []
  if (retirementReferences.length > 0) {
    const referenceTables = retirementReferences
      .map(referenceTable => assertSafeSqlIdentifier(referenceTable))
      .join(', ')
    await transaction(
      `/* cleanupPartitions:lockReference */ LOCK TABLE ${referenceTables} IN ACCESS EXCLUSIVE MODE NOWAIT`,
    )
  }
  // A raw history writer can take the parent before validating its referenced rows. Once we
  // hold referenced-table locks, waiting for either history lock could deadlock with that writer.
  const historyLockNowait = policy?.retirementReferenceTables?.length ? ' NOWAIT' : ''
  // Ordinary DETACH needs ACCESS EXCLUSIVE on the parent, so take that final mode before the child
  // to avoid a lock-upgrade deadlock with concurrent readers and writers.
  await transaction(
    `/* cleanupPartitions:lockParent */ LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE${historyLockNowait}`,
  )
  await transaction(
    `/* cleanupPartitions:lockCandidate */ LOCK TABLE ${partition} IN ACCESS EXCLUSIVE MODE${historyLockNowait}`,
  )
  if (policy?.legalHoldAccountColumn || policy?.copyrightHistory) {
    await transaction(
      `/* cleanupPartitions:lockHolds */ LOCK TABLE user_legal_preservation_holds IN SHARE MODE`,
    )
  }
  const reason = await getPartitionDropRefusal(transaction, candidate, policy, referenceDate)
  if (reason) return reason
  const parsed = parseMonthlyPartitionName(candidate.partition)!
  await retireMonthlyPartition(
    transaction,
    {
      table: candidate.table,
      partitionName: candidate.partition,
      year: parsed.year,
      month: parsed.month,
      dropPriority: 0,
    },
    beforeRetireMonthlyPartition,
  )
  return null
}
