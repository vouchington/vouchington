import { read } from '@data-stores/psql'
import onError from '@modules/on-error'
import {
  dataRetentionConfig,
  getClassifierRetentionDays,
  getPartitionStatusProbeLimit,
} from '@services/data-retention/config'
import {
  CLASSIFIER_RESULT_PARTITION_TABLES,
  PARTITION_DROP_POLICIES,
} from '@data-stores/psql/config-driven/utils/partition-config'
import { classifierRangeFromChild } from '@data-stores/psql/migration-runner/classifier-partition-range'
import {
  getMonthlyPartitionUpperBound,
  getPartitionDropStatusRefusals,
  type PartitionDropStatusReason,
} from '@data-stores/psql/migration-runner/partition-drop-guard'

interface PartitionInfo {
  name: string
  size_bytes: number
  drop_refusal: PartitionDropStatusReason | null
}

interface PartitionTable {
  name: string
  partition_count: number
  total_size_bytes: number
  partitions: PartitionInfo[]
}

export interface PartitionStatus {
  tables: PartitionTable[]
}

export async function getPartitionStatus(): Promise<PartitionStatus> {
  await dataRetentionConfig.waitForInitialization()
  const referenceDate = new Date()
  let rows: Record<string, unknown>[]
  try {
    const result = await read(
      `/* getPartitionStatus */
      SELECT parent.relname AS parent_table,
             child.relname AS partition_name,
             pg_get_expr(child.relpartbound, child.oid) AS partition_bound,
             pg_total_relation_size(child.oid) AS size_bytes
      FROM pg_inherits
      JOIN pg_class AS parent ON pg_inherits.inhparent = parent.oid
      JOIN pg_class AS child ON pg_inherits.inhrelid = child.oid
      JOIN pg_namespace AS ns ON parent.relnamespace = ns.oid
      WHERE ns.nspname = current_schema()
      ORDER BY parent.relname, child.relname`,
      [],
    )
    rows = result.rows
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    throw err
  }

  const classifierTables = new Set(CLASSIFIER_RESULT_PARTITION_TABLES)
  const candidates = rows.map(row => {
    const table = row.parent_table as string
    const partition = row.partition_name as string
    const classifierRange = classifierTables.has(table)
      ? classifierRangeFromChild(table, partition, row.partition_bound as string)
      : null
    return {
      table,
      partition,
      upperBound: classifierRange?.toDate ?? getMonthlyPartitionUpperBound(table, partition),
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
    if (classifierTables.has(candidate.table) && refusals.get(candidate.partition) === null) {
      refusals.set(candidate.partition, 'check-pending')
    }
  }
  const tableMap = new Map<string, PartitionInfo[]>()
  for (const row of rows) {
    const parentTable = row.parent_table as string
    const partition: PartitionInfo = {
      name: row.partition_name as string,
      size_bytes: parseInt(row.size_bytes as string, 10),
      drop_refusal: refusals.get(row.partition_name as string) ?? null,
    }
    if (!tableMap.has(parentTable)) tableMap.set(parentTable, [])
    tableMap.get(parentTable)!.push(partition)
  }

  const tables: PartitionTable[] = []
  for (const [name, partitions] of tableMap) {
    tables.push({
      name,
      partition_count: partitions.length,
      total_size_bytes: partitions.reduce((sum, p) => sum + p.size_bytes, 0),
      partitions,
    })
  }

  return { tables }
}
