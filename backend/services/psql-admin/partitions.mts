import { read } from '@data-stores/psql'
import onError from '@modules/on-error'

interface PartitionInfo {
  name: string
  size_bytes: number
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
  let rows: Record<string, unknown>[]
  try {
    const result = await read(
      `/* getPartitionStatus */
      SELECT parent.relname AS parent_table,
             child.relname AS partition_name,
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
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    throw error
  }

  const tableMap = new Map<string, PartitionInfo[]>()
  for (const row of rows) {
    const parentTable = row.parent_table as string
    const partition: PartitionInfo = {
      name: row.partition_name as string,
      size_bytes: parseInt(row.size_bytes as string, 10),
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
