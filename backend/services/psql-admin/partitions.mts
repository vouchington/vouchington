import { read } from '@data-stores/psql'
import {
  getPartitionStatus as getPlatformPartitionStatus,
  type PartitionStatus as PlatformPartitionStatus,
  type PartitionStatusRow,
} from '@vouchington/postgres/partitions'
import onError from '@modules/on-error'
import {
  dataRetentionConfig,
  getClassifierRetentionDays,
  getPartitionStatusProbeLimit,
} from '@services/data-retention/config'
import {
  CLASSIFIER_RESULT_PARTITION_TABLES,
  USER_DATA_REQUEST_PARTITION_TABLES,
} from '@data-stores/psql/config-driven/utils/partition-config'
import { PARTITION_DROP_POLICIES } from '@data-stores/psql/config-driven/utils/partition-drop-policies'
import { classifierRangeFromChild } from '@data-stores/psql/migration-runner/classifier-partition-range'
import {
  getMonthlyPartitionUpperBound,
  getPartitionDropStatusRefusals,
  type PartitionDropStatusReason,
} from '@data-stores/psql/migration-runner/partition-drop-guard'

export type PartitionStatus = PlatformPartitionStatus<PartitionDropStatusReason>

export async function getPartitionStatus(): Promise<PartitionStatus> {
  await dataRetentionConfig.waitForInitialization()
  const referenceDate = new Date()
  try {
    return await getPlatformPartitionStatus<PartitionDropStatusReason>({
      query: read,
      resolveRefusals: rows => resolveDropRefusals(rows, referenceDate),
    })
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    throw err
  }
}

async function resolveDropRefusals(rows: readonly PartitionStatusRow[], referenceDate: Date) {
  const classifierTables = new Set(CLASSIFIER_RESULT_PARTITION_TABLES)
  const requestTables = new Set<string>(USER_DATA_REQUEST_PARTITION_TABLES)
  const candidates = rows.map(row => {
    const table = row.parent_table
    const partition = row.partition_name
    const operatorRange =
      classifierTables.has(table) || requestTables.has(table)
        ? classifierRangeFromChild(table, partition, row.partition_bound)
        : null
    return {
      table,
      partition,
      upperBound: operatorRange?.toDate ?? getMonthlyPartitionUpperBound(table, partition),
    }
  })
  const policies = { ...PARTITION_DROP_POLICIES }
  for (const table of CLASSIFIER_RESULT_PARTITION_TABLES) {
    policies[table] = { minimumRetentionDays: getClassifierRetentionDays() }
  }
  const refusals = await getPartitionDropStatusRefusals(
    read,
    candidates,
    policies,
    referenceDate,
    getPartitionStatusProbeLimit(),
  )
  // A catalog age check cannot prove batch and run completion. The operator transaction rechecks
  // under locks, so the status remains check-pending even after the retention window passes.
  for (const candidate of candidates) {
    if (
      (classifierTables.has(candidate.table) || requestTables.has(candidate.table)) &&
      refusals.get(candidate.partition) === null
    ) {
      refusals.set(candidate.partition, 'check-pending')
    }
  }
  return refusals
}
