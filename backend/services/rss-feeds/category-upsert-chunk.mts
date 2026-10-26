import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import createHttpError from 'http-errors'
import { registerRssCategoryIdentities } from '@services/rss-feed-items/category-identities'
import { withTopicReferenceAttachmentFences } from '@services/post-publication/lock'
import { lockPostPublicationRssFeedScopes } from '@services/post-publication/capture-rss-feeds'
import { resolveRssFeedCategoryTopics } from './category-topic-resolution.mts'

export async function upsertRssFeedCategoriesChunk(
  rssFeedId: string,
  categories: string[],
): Promise<void> {
  // ast-grep-ignore: no-three-sequential-awaits -- category identities must exist before topic resolution, and resolved references require attachment fences before the write.
  await registerRssCategoryIdentities(categories, write)
  const resolved = await resolveRssFeedCategoryTopics(rssFeedId, categories)
  await withTopicReferenceAttachmentFences(
    resolved.flatMap(row =>
      [row.topic_id, row.previous_topic_id].filter((id): id is string => id !== null),
    ),
    {},
    async query => {
      await lockPostPublicationRssFeedScopes(query, [rssFeedId])
      const { rows: feeds } = await query<{ id: string }>(
        `/* upsertRssFeedCategories:lockFeed */
        SELECT id FROM rss_feeds WHERE id = $1::uuid
          AND hard_delete_requested_at IS NULL FOR SHARE`,
        [rssFeedId],
      )
      if (feeds.length === 0) throw createHttpError(409, 'RSS feed is being deleted')
      await query(
        sql`/* upsertRssFeedCategories:lockExisting */
          SELECT category_identity_id FROM rss_feed_categories
          WHERE rss_feed_id = ${rssFeedId}
            AND category_identity_id = ANY(${resolved.map(row => row.category_identity_id)}::uuid[])
          ORDER BY category_identity_id FOR UPDATE`,
      )
      const current = await resolveRssFeedCategoryTopics(rssFeedId, categories, query)
      if (JSON.stringify(current) !== JSON.stringify(resolved))
        throw createHttpError(
          409,
          'RSS feed category topics changed while acquiring attachment fences',
        )
      return write(
        sql`/* upsertRssFeedCategories */
          INSERT INTO rss_feed_categories (rss_feed_id, category_identity_id, topic_id)
          SELECT ${rssFeedId}::uuid AS rss_feed_id, input.category_identity_id, input.topic_id
          FROM UNNEST(
            ${resolved.map(row => row.category_identity_id)}::uuid[],
            ${resolved.map(row => row.topic_id)}::uuid[]
          ) AS input(category_identity_id, topic_id)
          ORDER BY rss_feed_id ASC NULLS LAST, input.category_identity_id ASC NULLS LAST
          ON CONFLICT (rss_feed_id, category_identity_id) DO UPDATE
            SET topic_id = EXCLUDED.topic_id`,
        { query },
      )
    },
  )
}
