import type { TransactionQuery } from '@data-stores/psql/types'

const NIL_UUID = '00000000-0000-0000-0000-000000000000'

export type TopicTextCategoryCursor = {
  phase: 0 | 1 | 2
  name: string
  slug: string
  scanUpperId: string
  afterId: string | null
}

export type TopicTextCategoryPage = {
  rows: Array<{ category_identity_id: string; content_id: string }>
  cursor: TopicTextCategoryCursor | null
  hasMore: boolean
  sourcePhase: 0 | 1 | null
}

/** The two canonical topic texts each identify at most one category identity. */
export async function readTopicTextCategoryRawPage(
  query: TransactionQuery,
  topicId: string,
  relation: 'rss_feed_item_categories' | 'rss_feed_categories',
  cursor: TopicTextCategoryCursor | null,
  pageSize: number,
): Promise<TopicTextCategoryPage> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1)
    throw new RangeError('Invalid category page size')
  if (cursor?.phase === 2) return { rows: [], cursor, hasMore: false, sourcePhase: null }
  let sweep = cursor
  if (!sweep) {
    const { rows: topics } = await query<{ name: string; slug: string }>(
      `/* readTopicTextCategoryRawPage topic */
       SELECT LOWER(name) AS name, slug FROM topics
       WHERE id = $1::uuid AND deleted_at IS NULL AND merged_into_topic_id IS NULL`,
      [topicId],
    )
    const topic = topics[0]
    if (!topic) return { rows: [], cursor: null, hasMore: false, sourcePhase: null }
    const upperRelation = relation === 'rss_feed_item_categories' ? 'rss_feed_items' : 'rss_feeds'
    const { rows: upperRows } = await query<{ id: string }>(
      `/* readTopicTextCategoryRawPage upper */
       SELECT id FROM ${upperRelation} WHERE id > '${NIL_UUID}'::uuid ORDER BY id DESC LIMIT 1`,
    )
    sweep = {
      phase: 0,
      name: topic.name,
      slug: topic.slug,
      scanUpperId: upperRows[0]?.id ?? NIL_UUID,
      afterId: null,
    }
  }
  const key = relation === 'rss_feed_item_categories' ? 'rss_feed_item_id' : 'rss_feed_id'
  const { rows } = await query<{ category_identity_id: string; content_id: string }>(
    `/* readTopicTextCategoryRawPage rows */
     SELECT category.category_identity_id, category.${key} AS content_id
     FROM rss_category_identities identity
     JOIN ${relation} category ON category.category_identity_id = identity.id
     WHERE identity.category_text = $1::text
       AND category.${key} > $2::uuid
       AND category.${key} <= $3::uuid
     ORDER BY category.${key}
     LIMIT $4::integer`,
    [
      sweep.phase === 0 ? sweep.name : sweep.slug,
      sweep.afterId ?? NIL_UUID,
      sweep.scanUpperId,
      pageSize + 1,
    ],
  )
  const selected = rows.slice(0, pageSize)
  const moreInPhase = rows.length > pageSize
  const nextPhase = moreInPhase ? sweep.phase : ((sweep.phase + 1) as 1 | 2)
  const nextCursor: TopicTextCategoryCursor = {
    ...sweep,
    phase: nextPhase,
    afterId: moreInPhase ? (selected.at(-1)?.content_id ?? null) : null,
  }
  return {
    rows: selected,
    cursor: nextCursor,
    hasMore: nextPhase !== 2,
    sourcePhase: sweep.phase as 0 | 1,
  }
}
