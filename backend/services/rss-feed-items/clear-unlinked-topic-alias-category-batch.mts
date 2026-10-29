import type { TransactionQuery } from '@data-stores/psql'
import type { ClearedCategoryTopicMapping } from './category-topic-votes.mts'
import { lockRssFeedItemsForStoryPublicationChanges } from './story-publication-change.mts'
import { lockTopicRssFeedAttachmentLifecycles } from '@services/post-publication/lock'
import createHttpError from 'http-errors'

export type ReResolvedCategoryTopicMapping = ClearedCategoryTopicMapping & {
  category_text: string
  replacement_topic_id: string | null
}

export type CategoryClearRawPage = {
  rows: Array<{ rss_feed_item_id: string; category_identity_id: string }>
  hasMore: boolean
  match: 'alias_id' | 'alias_text'
}

/** Locks candidate items before re-reading and updating their category rows. */
export async function clearUnlinkedTopicAliasCategoryBatch(
  query: TransactionQuery,
  topicAliasId: string,
  alias: string,
  formerTopicId: string | undefined,
  rawPage: CategoryClearRawPage,
): Promise<{ rows: ReResolvedCategoryTopicMapping[]; hasMore: boolean }> {
  const parameters = [topicAliasId, alias, formerTopicId ?? null, rawPage.rows.length]
  const sourcePredicate =
    rawPage.match === 'alias_id'
      ? 'category.topic_alias_id = $1::uuid'
      : 'identity.category_text = LOWER($2::text)'
  const candidateSql = `/* clearCategoriesForUnlinkedTopicAlias.rawCandidates */
       SELECT category.rss_feed_item_id, category.category_identity_id,
         category.category_text, category.topic_id AS previous_topic_id,
         replacement.topic_id AS replacement_topic_id
       FROM UNNEST($5::uuid[], $6::uuid[]) AS raw(rss_feed_item_id, category_identity_id)
       JOIN LATERAL (
         SELECT rss_feed_item_id, category_identity_id, category_text,
           topic_alias_id, topic_id
         FROM rss_feed_item_categories
         WHERE rss_feed_item_id = raw.rss_feed_item_id
           AND category_identity_id = raw.category_identity_id
         LIMIT 1
       ) category ON TRUE
       JOIN rss_category_identities identity ON identity.id = category.category_identity_id
       LEFT JOIN topic_aliases source_alias
         ON source_alias.id = $1::uuid AND source_alias.alias = LOWER($2::text)
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
       WHERE category.topic_id IS NOT NULL
         AND category.topic_id IS DISTINCT FROM replacement.topic_id
         AND ($3::uuid IS NULL OR category.topic_id = $3::uuid)
         AND ${sourcePredicate}
         AND NOT EXISTS (
           SELECT 1 FROM topic_aliases current_alias
           WHERE current_alias.id = $1::uuid AND current_alias.topic_id IS NOT NULL)
       ORDER BY category.rss_feed_item_id, category.category_identity_id
       LIMIT $4::integer`
  const rawParameters = [
    ...parameters,
    rawPage.rows.map(row => row.rss_feed_item_id),
    rawPage.rows.map(row => row.category_identity_id),
  ]
  const { rows: candidateItems } = await query<{
    rss_feed_item_id: string
    category_identity_id: string
    category_text: string
    previous_topic_id: string
    replacement_topic_id: string | null
  }>(candidateSql, rawParameters)
  const candidateItemIds = [...new Set(candidateItems.map(row => row.rss_feed_item_id))]
  await lockTopicRssFeedAttachmentLifecycles(
    query,
    candidateItems.flatMap(row =>
      [row.previous_topic_id, row.replacement_topic_id].filter(
        (topicId): topicId is string => topicId !== null,
      ),
    ),
  )
  await query(
    `/* clearCategoriesForUnlinkedTopicAlias.lockRawCategories */
     SELECT category.rss_feed_item_id
     FROM UNNEST($1::uuid[], $2::uuid[]) AS raw(rss_feed_item_id, category_identity_id)
     JOIN rss_feed_item_categories category
       ON category.rss_feed_item_id = raw.rss_feed_item_id
       AND category.category_identity_id = raw.category_identity_id
     ORDER BY category.rss_feed_item_id, category.category_identity_id
     FOR UPDATE OF category`,
    [
      candidateItems.map(row => row.rss_feed_item_id),
      candidateItems.map(row => row.category_identity_id),
    ],
  )
  if (rawPage.match === 'alias_text') {
    const { rows: linkedOwner } = await query<{ id: string }>(
      `/* clearCategoriesForUnlinkedTopicAlias.currentTextOwner */
       SELECT id FROM topic_aliases WHERE alias = LOWER($1::text) AND topic_id IS NOT NULL`,
      [alias],
    )
    if (linkedOwner.length > 0) return { rows: [], hasMore: rawPage.hasMore }
  }
  const { rows: currentCandidates } = await query(candidateSql, rawParameters)
  if (JSON.stringify(currentCandidates) !== JSON.stringify(candidateItems))
    throw createHttpError(
      409,
      'RSS item category mapping changed while acquiring attachment fences',
    )
  const replacementIds = [
    ...new Set(
      candidateItems.flatMap(row => (row.replacement_topic_id ? [row.replacement_topic_id] : [])),
    ),
  ]
  if (replacementIds.length > 0) {
    const { rows: active } = await query<{ id: string }>(
      `/* clearCategoriesForUnlinkedTopicAlias.activeReplacements */
       SELECT id FROM topics WHERE id = ANY($1::uuid[])
         AND deleted_at IS NULL AND merged_into_topic_id IS NULL`,
      [replacementIds],
    )
    if (active.length !== replacementIds.length)
      throw createHttpError(
        409,
        'RSS item category replacement changed while acquiring attachment fences',
      )
  }
  await lockRssFeedItemsForStoryPublicationChanges(query, candidateItemIds)
  const { rows } = await query<ReResolvedCategoryTopicMapping>(
    `/* clearCategoriesForUnlinkedTopicAlias */
      WITH input AS (
        SELECT * FROM UNNEST($1::uuid[], $2::uuid[], $3::text[], $4::uuid[], $5::uuid[])
          AS row(rss_feed_item_id, category_identity_id, category_text, previous_topic_id, replacement_topic_id)
      ), candidates AS (
        SELECT input.*
        FROM input
        JOIN rss_feed_item_categories category
          ON category.rss_feed_item_id = input.rss_feed_item_id
          AND category.category_identity_id = input.category_identity_id
        WHERE category.topic_id IS NOT DISTINCT FROM input.previous_topic_id
          AND (
            input.replacement_topic_id IS NULL
            OR EXISTS (
              SELECT 1 FROM topics replacement_topic
              WHERE replacement_topic.id = input.replacement_topic_id
                AND replacement_topic.deleted_at IS NULL
                AND replacement_topic.merged_into_topic_id IS NULL
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM topic_aliases current_alias
            WHERE current_alias.id = $6::uuid AND current_alias.topic_id IS NOT NULL
          )
        ORDER BY input.rss_feed_item_id, input.category_identity_id
        FOR UPDATE OF category
      )
      UPDATE rss_feed_item_categories target
      SET topic_id = candidates.replacement_topic_id
      FROM candidates
      WHERE target.rss_feed_item_id = candidates.rss_feed_item_id
        AND target.category_identity_id = candidates.category_identity_id
        AND target.topic_id IS DISTINCT FROM candidates.replacement_topic_id
      RETURNING
        target.rss_feed_item_id,
        target.category_text,
        candidates.previous_topic_id AS topic_id,
        candidates.replacement_topic_id`,
    [
      candidateItems.map(row => row.rss_feed_item_id),
      candidateItems.map(row => row.category_identity_id),
      candidateItems.map(row => row.category_text),
      candidateItems.map(row => row.previous_topic_id),
      candidateItems.map(row => row.replacement_topic_id),
      topicAliasId,
    ],
  )
  if (rows.length !== candidateItems.length)
    throw createHttpError(409, 'RSS item categories changed while clearing unlinked alias')
  return {
    rows,
    hasMore: rawPage.hasMore,
  }
}
