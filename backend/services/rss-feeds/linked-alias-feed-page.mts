import { beginTransaction } from '@data-stores/psql'
import { lockTopicRssFeedAttachmentLifecycles } from '@services/post-publication/lock'

/** Applies one raw feed page after topic fences and category row locks. */
export async function backfillLinkedAliasFeedPage(
  aliasId: string,
  alias: string,
  topicId: string,
  rows: ReadonlyArray<{ rss_feed_id: string; category_identity_id: string }>,
): Promise<number> {
  if (rows.length === 0) return 0
  await using transaction = await beginTransaction()
  const { rows: candidates } = await transaction<{
    rss_feed_id: string
    category_identity_id: string
    previous_topic_id: string | null
  }>(
    `/* backfillLinkedAliasFeedPage candidates */
     SELECT category.rss_feed_id, category.category_identity_id,
       category.topic_id AS previous_topic_id
     FROM UNNEST($2::uuid[], $3::uuid[]) AS raw(rss_feed_id, category_identity_id)
     JOIN rss_feed_categories category
       ON category.rss_feed_id = raw.rss_feed_id
       AND category.category_identity_id = raw.category_identity_id
     JOIN rss_category_identities identity ON identity.id = category.category_identity_id
     WHERE identity.category_text = LOWER($4::text)
       AND category.topic_id IS DISTINCT FROM $1::uuid
     ORDER BY category.rss_feed_id, category.category_identity_id`,
    [topicId, rows.map(row => row.rss_feed_id), rows.map(row => row.category_identity_id), alias],
  )
  if (candidates.length === 0) {
    await transaction.commit()
    return 0
  }
  await lockTopicRssFeedAttachmentLifecycles(transaction, [
    topicId,
    ...candidates.flatMap(row => (row.previous_topic_id ? [row.previous_topic_id] : [])),
  ])
  await transaction(
    `/* backfillLinkedAliasFeedPage lockCategories */
     SELECT category.rss_feed_id
     FROM UNNEST($1::uuid[], $2::uuid[]) AS raw(rss_feed_id, category_identity_id)
     JOIN rss_feed_categories category
       ON category.rss_feed_id = raw.rss_feed_id
       AND category.category_identity_id = raw.category_identity_id
     ORDER BY category.rss_feed_id, category.category_identity_id
     FOR UPDATE OF category`,
    [candidates.map(row => row.rss_feed_id), candidates.map(row => row.category_identity_id)],
  )
  const { rows: owner } = await transaction<{ id: string }>(
    `/* backfillLinkedAliasFeedPage currentOwner */
     SELECT id FROM topic_aliases
     WHERE id = $1::uuid AND alias = LOWER($2::text) AND topic_id = $3::uuid
       AND unlink_requested_at IS NULL`,
    [aliasId, alias, topicId],
  )
  if (owner.length === 0) {
    await transaction.commit()
    return 0
  }
  const { rowCount } = await transaction(
    `/* backfillLinkedAliasFeedPage update */
     UPDATE rss_feed_categories category SET topic_id = $1::uuid
     FROM UNNEST($2::uuid[], $3::uuid[], $4::uuid[])
       AS raw(rss_feed_id, category_identity_id, previous_topic_id)
     WHERE category.rss_feed_id = raw.rss_feed_id
       AND category.category_identity_id = raw.category_identity_id
       AND category.topic_id IS NOT DISTINCT FROM raw.previous_topic_id
       AND category.topic_id IS DISTINCT FROM $1::uuid`,
    [
      topicId,
      candidates.map(row => row.rss_feed_id),
      candidates.map(row => row.category_identity_id),
      candidates.map(row => row.previous_topic_id),
    ],
  )
  await transaction.commit()
  return rowCount ?? 0
}
