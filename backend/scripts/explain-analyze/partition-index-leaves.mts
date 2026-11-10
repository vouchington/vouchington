import { read } from '@data-stores/psql'

/** Leaf index names for one parent. Callers name that parent only. */
export async function partitionIndexLeaves(indexName: string): Promise<readonly string[]> {
  const { rows } = await read<{ index_name: string }>(
    `/* partitionIndexLeaves */
     SELECT index_class.relname AS index_name
     FROM pg_partition_tree($1::regclass) tree
     JOIN pg_class index_class ON index_class.oid = tree.relid
     WHERE tree.isleaf`,
    [indexName],
  )
  if (rows.length === 0) throw new Error(`${indexName} has no partition leaves`)
  return rows.map(row => row.index_name)
}
