import { write } from '@data-stores/psql'

export async function analyzeTestStoryUrlSourceRelations(): Promise<void> {
  await write(
    '/* analyzeTestStoryUrlSourceRelations */ ANALYZE posts, story_posts, rss_feed_items, rss_feed_item_sources, urls',
  )
}
