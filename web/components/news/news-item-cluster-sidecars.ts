import { mergePageResultsById, mergeRecords } from '@ts-shared/utils/collections'
import type { RssFeedItemsFeedResponseBody, StoryPageResponse } from '@/types/rss-feed-items'
import { mergeSidecars } from './news-item-cluster-projection'

export function mergeClusterPages(
  pages: RssFeedItemsFeedResponseBody[],
  feedPages: RssFeedItemsFeedResponseBody[],
  continuationPages: StoryPageResponse[],
) {
  return {
    allBookmarks: mergeSidecars(feedPages, continuationPages, page => page.bookmarks),
    allElectionVotes: mergeSidecars(feedPages, continuationPages, page => page.election_votes),
    allElections: mergeSidecars(feedPages, continuationPages, page => page.rss_feed_item_elections),
    allItems: mergeSidecars(feedPages, continuationPages, page => page.rss_feed_items),
    allPosts: mergeSidecars(feedPages, continuationPages, page => page.posts),
    allPostsMetrics: mergeSidecars(feedPages, continuationPages, page => page.posts_metrics),
    allRelatedPostsByUrlId: mergeSidecars(
      feedPages,
      continuationPages,
      page => page.related_posts_by_url_id,
    ),
    allResults: mergePageResultsById(pages),
    allStories: mergeRecords(feedPages, page => page.stories ?? {}),
    allStoryPostIds: mergeSidecars(feedPages, continuationPages, page => page.story_post_ids),
    allThumbnailUrls: mergeSidecars(
      feedPages,
      continuationPages,
      page => page.rss_feed_item_thumbnail_url,
    ),
    allEmbeds: mergeSidecars(feedPages, continuationPages, page => page.rss_feed_item_embeds),
    allContentHtml: mergeSidecars(
      feedPages,
      continuationPages,
      page => page.rss_feed_item_content_html,
    ),
    allRssFeedBookmarks: mergeSidecars(
      feedPages,
      continuationPages,
      page => page.rss_feed_bookmarks,
    ),
    allUsers: mergeRecords(feedPages, page => page.users ?? {}),
  }
}
