import { timestampToUuidv7LowerBound } from '../../../data-stores/psql/config-driven/utils/partition-utils.mts'

export const PRUNING_PARENTS = [
  'post_review_topic_ratings',
  'conversation_messages',
  'relation__post__category__topic__votes',
] as const
export const VOTE_PARENT = 'entity_relation_votes'
export const PROOF_YEARS = [2024, 2025] as const

export function rangeLeaf(parent: string, year: number): string {
  return `${parent}__proof_${year}`
}

export async function attachProofRanges(query: (text: string) => Promise<unknown>): Promise<void> {
  for (const parent of PRUNING_PARENTS) {
    for (const year of PROOF_YEARS) {
      const lower = timestampToUuidv7LowerBound(Date.UTC(year, 0, 1))
      const upper = timestampToUuidv7LowerBound(Date.UTC(year + 1, 0, 1))
      // All identifiers come from the fixed parent/year inventory above, not user input.
      await query(`/* attachProofRanges */ CREATE TABLE ${rangeLeaf(parent, year)}
        PARTITION OF ${parent} FOR VALUES FROM ('${lower}') TO ('${upper}')`)
    }
  }
}

export async function getPartitionLeaves(
  query: <Row extends Record<string, unknown>>(
    text: string,
    values: readonly unknown[],
  ) => Promise<{ rows: Row[] }>,
  parent: string,
): Promise<string[]> {
  const { rows } = await query<{ name: string }>(
    `/* getPartitionLeaves */ SELECT relid::regclass::text AS name
     FROM pg_partition_tree($1::regclass) WHERE isleaf ORDER BY relid::regclass::text`,
    [parent],
  )
  return rows.map(row => row.name)
}
