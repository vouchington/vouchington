import onError from '@modules/on-error'
import {
  assertSafeSqlIdentifier,
  listManagedMonthlyPartitions,
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

export type PartitionDropOutcome = {
  table: string
  partition: string
  outcome: 'dropped' | 'refused'
  reason?: PartitionDropRefusal | 'retirement-error'
}

export async function createMonthlyPartitions(writer: QueryExecutor = write): Promise<void> {
  await createPlatformMonthlyPartitions(writer, { tables: ALL_MONTHLY_PARTITION_TABLES })
}

export async function listMonthlyDropCandidates(
  query: QueryExecutor = write,
): Promise<PartitionDropCandidate[]> {
  const existing = await listManagedMonthlyPartitions(query, ALL_MONTHLY_PARTITION_TABLES)
  const priority = new Map(
    ALL_MONTHLY_PARTITION_TABLES.map(config => [config.table, config.dropPriority ?? 2]),
  )
  return existing
    .flatMap(row => {
      const parsed = parseMonthlyPartitionName(row.partition_table)
      if (!parsed || parsed.table !== row.parent_table) return []
      return [
        {
          table: row.parent_table,
          partition: row.partition_table,
          upperBound: new Date(Date.UTC(parsed.year, parsed.month, 1)),
        },
      ]
    })
    .toSorted(
      (left, right) =>
        (priority.get(left.table) ?? 2) - (priority.get(right.table) ?? 2) ||
        left.upperBound!.getTime() - right.upperBound!.getTime() ||
        left.partition.localeCompare(right.partition),
    )
}

export async function cleanupPartitions(
  referenceDate: Date = new Date(),
): Promise<PartitionDropOutcome[]> {
  const candidates = await listMonthlyDropCandidates()
  const outcomes = await retirePartitionsSequentially(candidates, candidate =>
    retireMonthlyPartitionCandidate(candidate, referenceDate),
  )
  for (const outcome of outcomes) console.info('Partition cleanup:', outcome)
  return outcomes
}

/** Retire one child transaction at a time; the next child starts only after the last settles. */
export async function retirePartitionsSequentially(
  candidates: readonly PartitionDropCandidate[],
  retireOne: (candidate: PartitionDropCandidate) => Promise<PartitionDropOutcome>,
): Promise<PartitionDropOutcome[]> {
  return candidates.reduce(
    async (previous, candidate) => {
      const outcomes = await previous
      // no-mistakes-disable-next-line query-reached-per-item: each partition requires its own locked guard recheck and atomic DDL transaction.
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
): Promise<PartitionDropOutcome> {
  const base = { table: candidate.table, partition: candidate.partition }
  const policy = PARTITION_DROP_POLICIES[candidate.table]
  const preflightReason = getPartitionDropAgeRefusal(candidate, policy, referenceDate)
  if (preflightReason) return { ...base, outcome: 'refused', reason: preflightReason }
  try {
    await using transaction = await beginTransaction()
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
  // Parent-before-child lock ordering matches partition DDL and blocks child writers during the check.
  await transaction(
    `/* cleanupPartitions:lockParent */ LOCK TABLE ${table} IN SHARE UPDATE EXCLUSIVE MODE`,
  )
  await transaction(
    `/* cleanupPartitions:lockCandidate */ LOCK TABLE ${partition} IN ACCESS EXCLUSIVE MODE`,
  )
  if (policy?.legalHoldAccountColumn) {
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
