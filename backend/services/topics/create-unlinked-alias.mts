import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { normalizeHashtag } from '@ts-shared/utils'
import assert from 'http-assert'
import type { TopicAlias } from './alias-types.mts'

/**
 * Creates or finds the unlinked alias for each hashtag with one INSERT. Rows are inserted in alias order, so
 * concurrent batches take conflict locks in one deterministic order.
 * Returns the alias by normalized key.
 */
export async function createUnlinkedTopicAliases(
  hashtags: readonly string[],
  options: QueryOptions = {},
): Promise<Map<string, TopicAlias>> {
  const keys = [
    ...new Set(
      hashtags.map(hashtag => {
        const normalized = normalizeHashtag(hashtag)
        assert(normalized, 422, 'Invalid hashtag')
        return normalized.key
      }),
    ),
  ]
  const aliases = new Map<string, TopicAlias>()
  if (keys.length === 0) return aliases
  const { rows: inserted } = await write<TopicAlias>(
    `/* createUnlinkedTopicAliases */
    INSERT INTO topic_aliases (alias)
    SELECT input.alias FROM unnest($1::text[]) AS input(alias)
    ORDER BY input.alias ASC NULLS LAST
    ON CONFLICT (alias) DO NOTHING
    RETURNING id, topic_id, alias`,
    [keys],
    options,
  )
  for (const row of inserted) aliases.set(row.alias, row)

  const missing = keys.filter(key => !aliases.has(key))
  if (missing.length === 0) return aliases
  const { rows: existing } = await write<TopicAlias & { unlink_requested_at: Date | null }>(
    `/* createUnlinkedTopicAliases existing */
      SELECT id, topic_id, alias, unlink_requested_at FROM topic_aliases
      WHERE alias = ANY($1::text[])`,
    [missing],
    options,
  )
  const existingByAlias = new Map(existing.map(row => [row.alias, row]))
  for (const key of missing) {
    const row = existingByAlias.get(key)
    assert(row, 409, 'Hashtag alias conflict disappeared')
    assert(!row.unlink_requested_at, 409, 'Topic alias unlink is in progress')
    aliases.set(key, { id: row.id, topic_id: row.topic_id, alias: row.alias })
  }
  return aliases
}

export async function createUnlinkedTopicAlias(
  hashtag: string,
  options: QueryOptions = {},
): Promise<TopicAlias> {
  const aliases = await createUnlinkedTopicAliases([hashtag], options)
  return [...aliases.values()][0]!
}
