import { getRssFeedItemsWorkLimit } from './work-limits.mts'
import type { TransactionQuery } from '@data-stores/psql'
import type { ClearedCategoryTopicMapping } from './category-topic-votes.mts'
import { lockRssFeedItemsForStoryPublicationChanges } from './story-publication-change.mts'

export type ReResolvedCategoryTopicMapping = ClearedCategoryTopicMapping & {
  category_text: string
  replacement_topic_id: string | null
}

/** Locks candidate items before re-reading and updating their category rows. */
export async function clearUnlinkedTopicAliasCategoryBatch(
  query: TransactionQuery,
  topicAliasId: string,
  alias: string,
  formerTopicId: string | undefined,
): Promise<{ rows: ReResolvedCategoryTopicMapping[]; hasMore: boolean }> {
  const replacementJoin = `LEFT JOIN topic_aliases source_alias ON source_alias.id = $1
        LEFT JOIN LATERAL (
          SELECT topic.id AS topic_id
          FROM topics topic
          WHERE topic.deleted_at IS NULL
            AND topic.merged_into_topic_id IS NULL
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
          ORDER BY topic.id
          LIMIT 1
        ) replacement ON TRUE`
  const CATEGORY_CLEAR_BATCH_SIZE = getRssFeedItemsWorkLimit('category_clear_batch_size')
  const parameters = [topicAliasId, alias, formerTopicId ?? null, CATEGORY_CLEAR_BATCH_SIZE]
  const { rows: candidateItems } = await query<{
    rss_feed_item_id: string
    candidate_count: string
  }>(
    `/* clearCategoriesForUnlinkedTopicAlias.candidateItems */
      SELECT DISTINCT rss_feed_item_id, count(*) OVER () AS candidate_count FROM (
        SELECT category.rss_feed_item_id, category.category_text
        FROM rss_feed_item_categories category
        JOIN rss_category_identities identity ON identity.id = category.category_identity_id
        ${replacementJoin}
        WHERE (category.topic_alias_id = $1 OR identity.category_text = LOWER($2))
          AND category.topic_id IS NOT NULL
          AND category.topic_id IS DISTINCT FROM replacement.topic_id
          AND ($3::uuid IS NULL OR category.topic_id = $3)
          AND NOT EXISTS (
            SELECT 1 FROM topic_aliases current_alias
            WHERE current_alias.id = $1 AND current_alias.topic_id IS NOT NULL
          )
        ORDER BY category.rss_feed_item_id, category.category_text LIMIT $4
      ) candidates ORDER BY rss_feed_item_id`,
    parameters,
  )
  const candidateItemIds = candidateItems.map(row => row.rss_feed_item_id)
  await lockRssFeedItemsForStoryPublicationChanges(query, candidateItemIds)
  const { rows } = await query<ReResolvedCategoryTopicMapping>(
    `/* clearCategoriesForUnlinkedTopicAlias */
      WITH candidates AS (
        SELECT
          category.rss_feed_item_id,
          category.category_identity_id,
          category.category_text,
          category.topic_id AS previous_topic_id,
          replacement.topic_id AS replacement_topic_id
        FROM rss_feed_item_categories category
        JOIN rss_category_identities identity ON identity.id = category.category_identity_id
        ${replacementJoin}
        WHERE (category.topic_alias_id = $1 OR identity.category_text = LOWER($2))
          AND category.rss_feed_item_id = ANY($5::uuid[])
          AND category.topic_id IS NOT NULL
          AND category.topic_id IS DISTINCT FROM replacement.topic_id
          AND ($3::uuid IS NULL OR category.topic_id = $3)
          AND NOT EXISTS (
            SELECT 1
            FROM topic_aliases current_alias
            WHERE current_alias.id = $1
              AND current_alias.topic_id IS NOT NULL
          )
        ORDER BY category.rss_feed_item_id, category.category_identity_id
        LIMIT $4
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
    [...parameters, candidateItemIds],
  )
  return {
    rows,
    hasMore: Number(candidateItems[0]?.candidate_count ?? 0) === CATEGORY_CLEAR_BATCH_SIZE,
  }
}
