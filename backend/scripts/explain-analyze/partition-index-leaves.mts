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

/** An id-ordered posts walk: the primary key, or the partial id index the planner may pick instead. */
export async function postIdOrderLeaves(): Promise<readonly string[]> {
  const [primaryKey, visibility] = await Promise.all([
    partitionIndexLeaves('posts_pkey'),
    partitionIndexLeaves('idx_posts__root_post_visibility'),
  ])
  return [...primaryKey, ...visibility]
}

/** Leaf index names for several parents in one read. */
export async function partitionIndexLeavesOf(indexNames: readonly string[]): Promise<string[]> {
  const { rows } = await read<{ index_name: string }>(
    `/* partitionIndexLeavesOf */
     SELECT DISTINCT index_class.relname AS index_name
     FROM unnest($1::text[]) AS parent(name)
     CROSS JOIN LATERAL pg_partition_tree(parent.name::regclass) tree
     JOIN pg_class index_class ON index_class.oid = tree.relid
     WHERE tree.isleaf`,
    [indexNames],
  )
  if (rows.length === 0) throw new Error(`${indexNames.join(', ')} have no partition leaves`)
  return rows.map(row => row.index_name)
}
