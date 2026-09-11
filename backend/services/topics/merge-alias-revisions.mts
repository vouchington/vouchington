import type { QueryExecutor } from '@data-stores/psql'
import { createTopicRevision } from '@services/topic-revisions'

export async function getTopicAliasesForMergeRevision(
  query: QueryExecutor,
  topicId: string,
): Promise<string[]> {
  const { rows } = await query<{ alias: string }>(
    `/* getTopicAliasesForMergeRevision */
      SELECT alias
      FROM topic_aliases
      WHERE topic_id = $1
      ORDER BY alias`,
    [topicId],
  )
  return rows.map(row => row.alias)
}

export async function createTopicAliasMergeRevisions({
  query,
  revisedById,
  sourceTopicId,
  destinationTopicId,
  aliasesToMove,
  destinationAliasesBefore,
}: {
  query: QueryExecutor
  revisedById: string
  sourceTopicId: string
  destinationTopicId: string
  aliasesToMove: string[]
  destinationAliasesBefore: string[]
}): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- the after snapshot and ordered revision inserts share one transaction
  const destinationAliasesAfter = await getTopicAliasesForMergeRevision(query, destinationTopicId)
  await createTopicRevision(
    sourceTopicId,
    'update',
    { topic_aliases: { before: aliasesToMove, after: [] } },
    revisedById,
    { query },
  )
  await createTopicRevision(
    destinationTopicId,
    'update',
    { topic_aliases: { before: destinationAliasesBefore, after: destinationAliasesAfter } },
    revisedById,
    { query },
  )
}
