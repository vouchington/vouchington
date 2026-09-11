import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { normalizeHashtag } from '@ts-shared/utils'
import assert from 'http-assert'
import type { TopicAlias } from './alias-types.mts'

export async function createUnlinkedTopicAlias(
  hashtag: string,
  options: QueryOptions = {},
): Promise<TopicAlias> {
  const normalized = normalizeHashtag(hashtag)
  assert(normalized, 422, 'Invalid hashtag')
  const { rows: inserted } = await write<TopicAlias>(
    `/* createUnlinkedTopicAlias */
    INSERT INTO topic_aliases (alias)
    VALUES ($1)
    ON CONFLICT (alias) DO NOTHING
    RETURNING id, topic_id, alias`,
    [normalized.key],
    options,
  )
  if (inserted[0]) return inserted[0]

  const { rows: existing } = await write<TopicAlias>(
    `/* createUnlinkedTopicAlias existing */
      SELECT id, topic_id, alias FROM topic_aliases WHERE alias = $1`,
    [normalized.key],
    options,
  )
  assert(existing[0], 409, 'Hashtag alias conflict disappeared')
  return existing[0]
}
