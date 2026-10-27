import { write } from '@data-stores/psql'

/** Models the valid interval between alias ownership change and queued category repair. */
export async function insertTestExpandedPublicationCategory(input: {
  itemId: string
  categoryId: string
  topicId: string
  aliasId: string
}): Promise<void> {
  await write(
    `/* insertTestExpandedPublicationCategory */
    INSERT INTO rss_feed_item_categories
      (rss_feed_item_id, category_identity_id, category_text, topic_id, topic_alias_id)
    VALUES ($1,$2,'Expanded publication category',$3,$4)`,
    [input.itemId, input.categoryId, input.topicId, input.aliasId],
  )
}
