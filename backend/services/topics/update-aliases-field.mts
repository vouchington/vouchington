import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { invalidate } from '@services/entity-cache/invalidate'

export async function updateTopicAliasesField(
  topicId: string,
  { skipSideEffects = false, ...queryOptions }: { skipSideEffects?: boolean } & QueryOptions = {},
): Promise<string[]> {
  const { rows } = await write<{ aliases: string[] }>(
    `/* updateTopicAliasesField */
    UPDATE topics SET aliases = (
      SELECT COALESCE(ARRAY_AGG(alias ORDER BY alias), '{}')
      FROM topic_aliases WHERE topic_id = $1
    )
    WHERE id = $1
    RETURNING aliases`,
    [topicId],
    queryOptions,
  )
  if (!skipSideEffects) await invalidate.topics(topicId)
  return rows[0]?.aliases ?? []
}
