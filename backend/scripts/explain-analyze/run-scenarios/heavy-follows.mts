import { heavyFollowUser, runAndCapture, seedUser } from '../run-support.mts'
import * as services from '../run-services.mts'
import { STORY_POST_RELATED_URL_PROJECTION_SEED } from '../seed-data/story-post-related-url-projection.mts'
import { runRssFeedFirstAndContinuationScenarios } from './rss-feed-pages.mts'

const { getPostFeedIds, getPostIds, getRssFeedItemFeedIds } = services

export async function runHeavyFollowScenarios() {
  // Heavy-follow user scenarios — test feed queries with a power user who
  // follows 1000 users, 200 topics, and 200 RSS feeds.
  // Results are suffixed with ':heavy' so the comparison table can pair them
  // with the baseline results above.
  await runAndCapture(
    'post-feed-heavy-follows',
    () => getPostFeedIds(heavyFollowUser as any, { limit: 25, time_range: '1w' }),
    'heavy',
  )
  await runAndCapture(
    'post-feed-heavy-follow-users',
    () =>
      getPostFeedIds(heavyFollowUser as any, {
        feed_type: 'follow_users',
        limit: 25,
        time_range: '1w',
      }),
    'heavy-follow-users',
  )
  await runAndCapture(
    'post-feed-heavy-follow-topics',
    () =>
      getPostFeedIds(heavyFollowUser as any, {
        feed_type: 'follow_topics',
        limit: 25,
        time_range: '1w',
      }),
    'heavy-follow-topics',
  )
  await runAndCapture(
    'post-feed-heavy-all',
    () =>
      getPostFeedIds(heavyFollowUser as any, {
        feed_type: 'all',
        limit: 25,
        time_range: '1w',
      }),
    'heavy-all',
  )
  await runAndCapture(
    'post-feed-heavy-hot',
    () => getPostFeedIds(heavyFollowUser as any, { sort: 'hot', limit: 25, time_range: '1w' }),
    'heavy-hot',
  )

  await runRssFeedFirstAndContinuationScenarios(
    'rss-feed-item-feed-heavy-follows',
    heavyFollowUser as any,
    { limit: 25, time_range: '1w' },
    'heavy',
  )
  await runAndCapture(
    'rss-feed-item-feed-heavy-follow-rss-feeds',
    () =>
      getRssFeedItemFeedIds(heavyFollowUser as any, {
        feed_type: 'follow_rss_feeds',
        limit: 25,
        time_range: '1w',
      }),
    'heavy-follow-rss-feeds',
  )
  await runAndCapture(
    'rss-feed-item-feed-heavy-follow-topics',
    () =>
      getRssFeedItemFeedIds(heavyFollowUser as any, {
        feed_type: 'follow_topics',
        limit: 25,
        time_range: '1w',
      }),
    'heavy-follow-topics',
  )
  await runAndCapture(
    'rss-feed-item-feed-heavy-all',
    () =>
      getRssFeedItemFeedIds(heavyFollowUser as any, {
        feed_type: 'all',
        limit: 25,
        time_range: '1w',
      }),
    'heavy-all',
  )
  await runAndCapture('rss-feed-item-feed-heavy-story-skew', async () => {
    const page = await getRssFeedItemFeedIds(heavyFollowUser as any, {
      limit: 25,
      time_range: '1w',
      text_search_query: STORY_POST_RELATED_URL_PROJECTION_SEED.feedSearchToken,
    })
    if (
      page.results.length !== 1 ||
      page.results[0]?.story_id !== STORY_POST_RELATED_URL_PROJECTION_SEED.storyId ||
      page.page_info.has_next_page
    ) {
      throw new Error('RSS story-skew scenario must return one canonical direct representative')
    }
  })

  await runAndCapture(
    'post-search-heavy-follows',
    () => getPostIds(heavyFollowUser as any, { sort: 'best', limit: 25, time_range: '1w' }),
    'heavy',
  )
  await runAndCapture(
    'post-search-following-new-heavy-follows',
    () =>
      getPostIds(heavyFollowUser as any, {
        sort: 'following_new',
        limit: 25,
        time_range: '1w',
      }),
    'following-new-heavy',
  )
  await runAndCapture(
    'post-search-profile',
    () => getPostIds(seedUser as any, { user_id: seedUser.id, limit: 25, time_range: '1w' }),
    'profile',
  )
}
