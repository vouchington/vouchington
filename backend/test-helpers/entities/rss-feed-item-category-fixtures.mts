import { allowUnannotatedQuery } from '@data-stores/psql/prepared-statement-name'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function addCategoryToRssFeedItem(
  rssFeedItemId: string,
  topicId: string,
  categoryText = 'test-category',
): Promise<void> {
  await write(
    allowUnannotatedQuery(sql`
    INSERT INTO rss_feed_item_categories (rss_feed_item_id, category_text, topic_id)
    VALUES (${rssFeedItemId}, ${categoryText}, ${topicId})
    ON CONFLICT DO NOTHING
  `),
  )
}

export async function addTopicAliasCategoryToRssFeedItem(
  rssFeedItemId: string,
  topicAliasId: string,
  categoryText = 'test-alias-category',
): Promise<void> {
  await write(
    allowUnannotatedQuery(sql`
    INSERT INTO rss_feed_item_categories (rss_feed_item_id, category_text, topic_alias_id)
    VALUES (${rssFeedItemId}, ${categoryText}, ${topicAliasId})
    ON CONFLICT DO NOTHING
  `),
  )
}

export async function insertUnmappedRssFeedItemCategory(
  rssFeedItemId: string,
  categoryText: string,
): Promise<void> {
  await write(
    allowUnannotatedQuery(sql`
    INSERT INTO rss_feed_item_categories (rss_feed_item_id, category_text, topic_id)
    VALUES (${rssFeedItemId}, ${categoryText}, NULL)
    ON CONFLICT DO NOTHING
  `),
  )
}
