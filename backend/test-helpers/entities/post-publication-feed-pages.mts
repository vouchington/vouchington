import { write } from '@data-stores/psql'
import { insertTestRssFeedItemSourceBatch } from './post-publication-dirty-work-batches.mts'
import { insertTestStoryRssFeedItemsBatch } from './stories.mts'

export async function insertTestPublicationSourceLessFeedItems(
  postId: string,
  count: number,
): Promise<void> {
  const { rows } = await write<{ story_id: string; url_id: string }>(
    `/* findPublicationSourceLessFeedFixture */ SELECT story.story_id, item.url_id FROM post__stories story
      JOIN rss_feed_items item ON item.story_id = story.story_id WHERE story.post_id = $1 ORDER BY item.id LIMIT 1`,
    [postId],
  )
  const source = rows[0]
  if (!source) throw new Error('Expected publication story/feed fixture')
  await insertTestStoryRssFeedItemsBatch({
    storyId: source.story_id,
    urlId: source.url_id,
    count,
  })
}

export async function insertTestPublicationAdditionalFeedItems(
  postId: string,
  feedId: string,
  count: number,
  deleted = false,
): Promise<void> {
  const { rows } = await write<{ story_id: string; url_id: string }>(
    `/* findPublicationFeedStoryFixture */ SELECT story.story_id, item.url_id FROM post__stories story
      JOIN rss_feed_items item ON item.story_id = story.story_id AND item.deleted_at IS NULL
      WHERE story.post_id = $1 ORDER BY item.id LIMIT 1`,
    [postId],
  )
  const source = rows[0]
  if (!source) throw new Error('Expected publication story/feed fixture')
  const itemIds = await insertTestRssFeedItemSourceBatch({
    count,
    rssFeedId: feedId,
    urlId: source.url_id,
  })
  await write(
    `/* mapPublicationFeedItemFixturesToStory */ UPDATE rss_feed_items SET story_id = $1,
      deleted_at = CASE WHEN $3 THEN CURRENT_TIMESTAMP END WHERE id = ANY($2::uuid[])`,
    [source.story_id, itemIds, deleted],
  )
}
