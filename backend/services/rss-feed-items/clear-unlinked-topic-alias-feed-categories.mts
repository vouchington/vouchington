import type { TransactionQuery } from '@data-stores/psql'
import { lockTopicRssFeedAttachmentLifecycles } from '@services/post-publication/lock'
import createHttpError from 'http-errors'

type FeedCategoryCandidate = {
  rss_feed_id: string
  category_identity_id: string
  previous_topic_id: string
  replacement_topic_id: string | null
}

export async function clearUnlinkedTopicAliasFeedCategories(
  query: TransactionQuery,
  topicAliasId: string,
  alias: string,
  formerTopicId: string | undefined,
  batchSize: number,
): Promise<number> {
  const candidateSql = `/* clearCategoriesForUnlinkedTopicAlias.feedCandidates */
      SELECT feed_category.rss_feed_id, feed_category.category_identity_id,
        feed_category.topic_id AS previous_topic_id,
        replacement.topic_id AS replacement_topic_id
      FROM rss_feed_categories feed_category
      JOIN rss_category_identities identity ON identity.id = feed_category.category_identity_id
      LEFT JOIN topic_aliases source_alias ON source_alias.id = $1
      LEFT JOIN LATERAL (
        SELECT topic.id AS topic_id
        FROM topics topic
        WHERE topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL
          AND (
            LOWER(topic.name) IN (
              identity.category_text,
              CASE WHEN LEFT(identity.category_text, 1) = '#' THEN SUBSTRING(identity.category_text FROM 2) ELSE identity.category_text END,
              LOWER(source_alias.alias)
            )
            OR topic.slug IN (
              identity.category_text,
              CASE WHEN LEFT(identity.category_text, 1) = '#' THEN SUBSTRING(identity.category_text FROM 2) ELSE identity.category_text END,
              LOWER(source_alias.alias)
            )
          )
        ORDER BY topic.id LIMIT 1
      ) replacement ON TRUE
      WHERE feed_category.topic_id IS NOT NULL
        AND identity.category_text = LOWER($2)
        AND ($3::uuid IS NULL OR feed_category.topic_id = $3)
        AND feed_category.topic_id IS DISTINCT FROM replacement.topic_id
        AND NOT EXISTS (
          SELECT 1 FROM topic_aliases current_alias
          WHERE current_alias.alias = LOWER($2) AND current_alias.topic_id IS NOT NULL
        )
      ORDER BY feed_category.rss_feed_id, feed_category.category_identity_id
      LIMIT $4`
  const parameters = [topicAliasId, alias, formerTopicId ?? null, batchSize]
  const { rows: candidates } = await query<FeedCategoryCandidate>(candidateSql, parameters)
  if (candidates.length === 0) return 0
  await lockTopicRssFeedAttachmentLifecycles(
    query,
    candidates.flatMap(row =>
      [row.previous_topic_id, row.replacement_topic_id].filter(
        (topicId): topicId is string => topicId !== null,
      ),
    ),
  )
  const { rows: currentCandidates } = await query<FeedCategoryCandidate>(candidateSql, parameters)
  if (JSON.stringify(currentCandidates) !== JSON.stringify(candidates))
    throw createHttpError(
      409,
      'RSS feed category mapping changed while acquiring attachment fences',
    )
  const replacementIds = [
    ...new Set(
      candidates.flatMap(row => (row.replacement_topic_id ? [row.replacement_topic_id] : [])),
    ),
  ]
  if (replacementIds.length > 0) {
    const { rows: active } = await query<{ id: string }>(
      `/* clearCategoriesForUnlinkedTopicAlias.feedActiveReplacements */
       SELECT id FROM topics WHERE id = ANY($1::uuid[])
         AND deleted_at IS NULL AND merged_into_topic_id IS NULL`,
      [replacementIds],
    )
    if (active.length !== replacementIds.length)
      throw createHttpError(
        409,
        'RSS feed category replacement changed while acquiring attachment fences',
      )
  }
  const { rowCount } = await query(
    `/* clearCategoriesForUnlinkedTopicAlias.feedCategories */
      WITH input AS (
        SELECT * FROM UNNEST($1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[])
          AS row(rss_feed_id, category_identity_id, previous_topic_id, replacement_topic_id)
      ), candidates AS (
        SELECT input.* FROM input
        JOIN rss_feed_categories category
          ON category.rss_feed_id = input.rss_feed_id
          AND category.category_identity_id = input.category_identity_id
        WHERE category.topic_id = input.previous_topic_id
          AND (
            input.replacement_topic_id IS NULL
            OR EXISTS (
              SELECT 1 FROM topics topic
              WHERE topic.id = input.replacement_topic_id
                AND topic.deleted_at IS NULL AND topic.merged_into_topic_id IS NULL
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM topic_aliases current_alias
            WHERE current_alias.alias = LOWER($5) AND current_alias.topic_id IS NOT NULL
          )
        ORDER BY input.rss_feed_id, input.category_identity_id
        FOR UPDATE OF category
      )
      UPDATE rss_feed_categories target
      SET topic_id = candidates.replacement_topic_id
      FROM candidates
      WHERE target.rss_feed_id = candidates.rss_feed_id
        AND target.category_identity_id = candidates.category_identity_id
        AND target.topic_id IS DISTINCT FROM candidates.replacement_topic_id`,
    [
      candidates.map(row => row.rss_feed_id),
      candidates.map(row => row.category_identity_id),
      candidates.map(row => row.previous_topic_id),
      candidates.map(row => row.replacement_topic_id),
      alias,
    ],
  )
  if (rowCount !== candidates.length)
    throw createHttpError(409, 'RSS feed categories changed while clearing unlinked alias')
  return rowCount
}
