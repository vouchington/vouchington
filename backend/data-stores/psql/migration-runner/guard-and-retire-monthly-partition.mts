import {
  assertSafeSqlIdentifier,
  parseMonthlyPartitionName,
  retireMonthlyPartition,
} from '@vouchington/postgres/partitions'
import type { PartitionDropPolicy } from '../config-driven/utils/partition-drop-policies.mts'
import type { QueryExecutor } from '../types.mts'
import {
  isCopyrightReportSource,
  recordCopyrightHistoryReportSourceRetirement,
} from './copyright-history-report-probe.mts'
import { beforeRetireMonthlyPartition } from './before-retire-monthly-partition.mts'
import { clearBoundedFeedbackReferences } from './feedback-reference-retirement.mts'
import {
  getPartitionDropRefusal,
  type PartitionDropCandidate,
  type PartitionDropRefusal,
} from './partition-drop-guard.mts'

/** The caller owns the transaction and commits only after this guarded detach succeeds. */
export async function guardAndRetireMonthlyPartition(
  transaction: QueryExecutor,
  candidate: PartitionDropCandidate,
  policy: PartitionDropPolicy | undefined,
  referenceDate: Date,
  feedbackBatchSize: number,
): Promise<PartitionDropRefusal | null> {
  const table = assertSafeSqlIdentifier(candidate.table)
  const partition = assertSafeSqlIdentifier(candidate.partition)
  // Common case first: a child that still holds rows (for example protected replay usage) cannot be
  // retired, so decide that with an unlocked read before taking any lock on a hot parent table.
  if (policy?.mustBeEmpty) {
    const { rows } = await transaction(
      `/* cleanupPartitions:probeNonEmpty */ SELECT 1 FROM ${partition} LIMIT 1`,
    )
    if (rows.length > 0) return 'in-flight'
  }
  const reportSource = isCopyrightReportSource(candidate.table)
  if (reportSource) {
    // Report compilation takes this row before reading source history.
    await transaction(`/* cleanupPartitions:lockReportGeneration */
      SELECT 1 FROM copyright_legal_mutation_sequence_states WHERE is_singleton FOR SHARE`)
  }
  // Party writers update this generation before appending history. Fence them first so the
  // final hold probe cannot miss an already-held account newly joining a case.
  if (policy?.copyrightHistory) {
    await transaction(
      `/* cleanupPartitions:lockCopyrightParties */ LOCK TABLE copyright_notice_thread_party_generations IN SHARE MODE${reportSource ? ' NOWAIT' : ''}`,
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
  const historyLockNowait =
    reportSource || policy?.retirementReferenceTables?.length ? ' NOWAIT' : ''
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
      `/* cleanupPartitions:lockHolds */ LOCK TABLE user_legal_preservation_holds IN SHARE MODE${historyLockNowait}`,
    )
  }
  const reason = await getPartitionDropRefusal(transaction, candidate, policy, referenceDate)
  if (reason) return reason
  if (candidate.table === 'post_clearance_changes') {
    const feedbackPending = await clearBoundedFeedbackReferences(
      transaction,
      candidate,
      feedbackBatchSize,
    )
    if (feedbackPending) return 'feedback-references-pending'
  }
  if (reportSource) {
    await recordCopyrightHistoryReportSourceRetirement(transaction, partition)
  }
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
