import type { TransactionQuery } from '@data-stores/psql'
import { lockTopicRssFeedAttachmentLifecycles } from '@services/post-publication/lock'
import { tryLockAndAssertNoActiveTopicMerges } from '@services/topics/merge-preflight'
import createHttpError from 'http-errors'

type FeedCategoryCandidate = {
  rss_feed_id: string
  category_identity_id: string
  previous_topic_id: string
  replacement_topic_id: string | null
}

/** Applies only the feed rows from one indexed raw page, preserving the normal replacement rule. */
export async function clearUnlinkedTopicAliasFeedPage(
  query: TransactionQuery,
  topicAliasId: string,
  alias: string,
  rows: ReadonlyArray<{ rss_feed_id: string; category_identity_id: string }>,
): Promise<number> {
  if (rows.length === 0) return 0
  const candidateSql = `/* clearUnlinkedTopicAliasFeedPage candidates */
     SELECT category.rss_feed_id, category.category_identity_id,
       category.topic_id AS previous_topic_id, replacement.topic_id AS replacement_topic_id
     FROM UNNEST($2::uuid[], $3::uuid[]) AS raw(rss_feed_id, category_identity_id)
     JOIN rss_feed_categories category
       ON category.rss_feed_id = raw.rss_feed_id
       AND category.category_identity_id = raw.category_identity_id
     JOIN rss_category_identities identity ON identity.id = category.category_identity_id
     LEFT JOIN topic_aliases source_alias ON source_alias.id = $1::uuid
     LEFT JOIN LATERAL (
       SELECT topic.id AS topic_id FROM topics topic
       WHERE topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL
         AND (LOWER(topic.name) IN (
           identity.category_text,
           CASE WHEN LEFT(identity.category_text, 1) = '#'
             THEN SUBSTRING(identity.category_text FROM 2) ELSE identity.category_text END,
           LOWER(source_alias.alias))
           OR topic.slug IN (
             identity.category_text,
             CASE WHEN LEFT(identity.category_text, 1) = '#'
               THEN SUBSTRING(identity.category_text FROM 2) ELSE identity.category_text END,
             LOWER(source_alias.alias)))
       ORDER BY topic.id LIMIT 1
     ) replacement ON TRUE
     WHERE identity.category_text = LOWER($4::text)
       AND category.topic_id IS NOT NULL
       AND category.topic_id IS DISTINCT FROM replacement.topic_id
     ORDER BY category.rss_feed_id, category.category_identity_id`
  const candidateParameters = [
    topicAliasId,
    rows.map(row => row.rss_feed_id),
    rows.map(row => row.category_identity_id),
    alias,
  ]
  const { rows: candidates } = await query<FeedCategoryCandidate>(candidateSql, candidateParameters)
  if (candidates.length === 0) return 0
  const topicIds = candidates.flatMap(row =>
    [row.previous_topic_id, row.replacement_topic_id].filter(
      (topicId): topicId is string => topicId !== null,
    ),
  )
  await lockFeedCategoryTopics(query, topicIds)
  await query(
    `/* clearUnlinkedTopicAliasFeedPage lockCategories */
     SELECT category.rss_feed_id
     FROM UNNEST($1::uuid[], $2::uuid[]) AS raw(rss_feed_id, category_identity_id)
     JOIN rss_feed_categories category
       ON category.rss_feed_id = raw.rss_feed_id
       AND category.category_identity_id = raw.category_identity_id
     ORDER BY category.rss_feed_id, category.category_identity_id
     FOR UPDATE OF category`,
    [candidates.map(row => row.rss_feed_id), candidates.map(row => row.category_identity_id)],
  )
  const { rows: linkedOwner } = await query<{ id: string }>(
    `/* clearUnlinkedTopicAliasFeedPage currentTextOwner */
     SELECT id FROM topic_aliases WHERE alias = LOWER($1::text) AND topic_id IS NOT NULL`,
    [alias],
  )
  if (linkedOwner.length > 0) return 0
  const { rows: currentCandidates } = await query<FeedCategoryCandidate>(
    candidateSql,
    candidateParameters,
  )
  if (JSON.stringify(currentCandidates) !== JSON.stringify(candidates))
    throw createHttpError(409, 'RSS feed category mapping changed while acquiring topic fences')
  const replacementIds = [
    ...new Set(
      candidates.flatMap(row => (row.replacement_topic_id ? [row.replacement_topic_id] : [])),
    ),
  ]
  if (replacementIds.length > 0) {
    const { rows: activeReplacements } = await query<{ id: string }>(
      `/* clearUnlinkedTopicAliasFeedPage activeReplacements */
       SELECT id FROM topics WHERE id = ANY($1::uuid[])
         AND deleted_at IS NULL AND merged_into_topic_id IS NULL`,
      [replacementIds],
    )
    if (activeReplacements.length !== replacementIds.length)
      throw createHttpError(409, 'RSS feed category replacement topic changed')
  }
  const { rowCount } = await query(
    `/* clearUnlinkedTopicAliasFeedPage update */
     UPDATE rss_feed_categories category
     SET topic_id = raw.replacement_topic_id
     FROM UNNEST($1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[])
       AS raw(rss_feed_id, category_identity_id, previous_topic_id, replacement_topic_id)
     WHERE category.rss_feed_id = raw.rss_feed_id
       AND category.category_identity_id = raw.category_identity_id
       AND category.topic_id = raw.previous_topic_id
       AND category.topic_id IS DISTINCT FROM raw.replacement_topic_id
       AND (raw.replacement_topic_id IS NULL OR EXISTS (
         SELECT 1 FROM topics replacement
         WHERE replacement.id = raw.replacement_topic_id
           AND replacement.deleted_at IS NULL
           AND replacement.merged_into_topic_id IS NULL
       ))`,
    [
      candidates.map(row => row.rss_feed_id),
      candidates.map(row => row.category_identity_id),
      candidates.map(row => row.previous_topic_id),
      candidates.map(row => row.replacement_topic_id),
    ],
  )
  if (rowCount !== candidates.length)
    throw createHttpError(409, 'RSS feed category mapping changed before update')
  return rowCount
}

async function lockFeedCategoryTopics(query: TransactionQuery, topicIds: string[]): Promise<void> {
  await tryLockAndAssertNoActiveTopicMerges(query, topicIds)
  await lockTopicRssFeedAttachmentLifecycles(query, topicIds)
}
