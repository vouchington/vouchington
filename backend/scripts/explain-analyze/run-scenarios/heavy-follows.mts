import { heavyFollowUser, runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import * as services from '../run-services.mts'
import { STORY_POST_RELATED_URL_PROJECTION_SEED } from '../seed-data/story-post-related-url-projection.mts'
import {
  registerRssFeedCandidateScenario,
  runRssFeedFirstAndContinuationScenarios,
} from './rss-feed-pages.mts'

const { getPostFeedIds, getPostIds, getRssFeedItemFeedIds } = services

export async function runHeavyFollowScenarios() {
  // Heavy-follow user scenarios — test feed queries with a power user who
  // follows 1000 users, 200 topics, and 200 RSS feeds.
  // Results are suffixed with ':heavy' so the comparison table can pair them
  // with the baseline results above.
  registerScenarioContract('post-feed-heavy-follows', {
    expectations: [],
    crossPartition: {
      posts: 'The heavy-follows feed ranks eligible posts across the requested week.',
    },
  })
  await runAndCapture(
    'post-feed-heavy-follows',
    () => getPostFeedIds(heavyFollowUser, { limit: 25, time_range: '1w' }),
    'heavy',
  )
  registerScenarioContract('post-feed-heavy-follow-users', {
    expectations: [],
    crossPartition: {
      posts: 'The heavy-follows feed ranks eligible posts across the requested week.',
    },
  })
  await runAndCapture(
    'post-feed-heavy-follow-users',
    () =>
      getPostFeedIds(heavyFollowUser, {
        feed_type: 'follow_users',
        limit: 25,
        time_range: '1w',
      }),
    'heavy-follow-users',
  )
  registerScenarioContract('post-feed-heavy-follow-topics', {
    expectations: [],
    crossPartition: {
      posts: 'The heavy-follows feed ranks eligible posts across the requested week.',
    },
  })
  await runAndCapture(
    'post-feed-heavy-follow-topics',
    () =>
      getPostFeedIds(heavyFollowUser, {
        feed_type: 'follow_topics',
        limit: 25,
        time_range: '1w',
      }),
    'heavy-follow-topics',
  )
  registerScenarioContract('post-feed-heavy-all', {
    expectations: [],
    crossPartition: {
      posts: 'The heavy-follows feed ranks eligible posts across the requested week.',
    },
  })
  await runAndCapture(
    'post-feed-heavy-all',
    () =>
      getPostFeedIds(heavyFollowUser, {
        feed_type: 'all',
        limit: 25,
        time_range: '1w',
      }),
    'heavy-all',
  )
  registerScenarioContract('post-feed-heavy-hot', {
    expectations: [],
    crossPartition: {
      posts: 'The heavy-follows feed ranks eligible posts across the requested week.',
    },
  })
  await runAndCapture(
    'post-feed-heavy-hot',
    () => getPostFeedIds(heavyFollowUser, { sort: 'hot', limit: 25, time_range: '1w' }),
    'heavy-hot',
  )

  await runRssFeedFirstAndContinuationScenarios(
    'rss-feed-item-feed-heavy-follows',
    heavyFollowUser,
    { limit: 25, time_range: '1w' },
    'heavy',
  )
  registerRssFeedCandidateScenario('rss-feed-item-feed-heavy-follow-rss-feeds')
  await runAndCapture(
    'rss-feed-item-feed-heavy-follow-rss-feeds',
    () =>
      getRssFeedItemFeedIds(heavyFollowUser, {
        feed_type: 'follow_rss_feeds',
        limit: 25,
        time_range: '1w',
      }),
    'heavy-follow-rss-feeds',
  )
  registerRssFeedCandidateScenario('rss-feed-item-feed-heavy-follow-topics')
  await runAndCapture(
    'rss-feed-item-feed-heavy-follow-topics',
    () =>
      getRssFeedItemFeedIds(heavyFollowUser, {
        feed_type: 'follow_topics',
        limit: 25,
        time_range: '1w',
      }),
    'heavy-follow-topics',
  )
  registerRssFeedCandidateScenario('rss-feed-item-feed-heavy-all')
  await runAndCapture(
    'rss-feed-item-feed-heavy-all',
    () =>
      getRssFeedItemFeedIds(heavyFollowUser, {
        feed_type: 'all',
        limit: 25,
        time_range: '1w',
      }),
    'heavy-all',
  )
  registerRssFeedCandidateScenario('rss-feed-item-feed-heavy-story-skew')
  await runAndCapture('rss-feed-item-feed-heavy-story-skew', async () => {
    const page = await getRssFeedItemFeedIds(heavyFollowUser, {
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

  registerScenarioContract('post-search-heavy-follows', {
    expectations: [],
    crossPartition: { posts: 'Search ranks eligible posts across the requested week.' },
  })

  await runAndCapture(
    'post-search-heavy-follows',
    () => getPostIds(heavyFollowUser, { sort: 'best', limit: 25, time_range: '1w' }),
    'heavy',
  )
  registerScenarioContract('post-search-following-new-heavy-follows', {
    expectations: [],
    crossPartition: { posts: 'Following search ranks eligible posts across the requested week.' },
  })
  await runAndCapture(
    'post-search-following-new-heavy-follows',
    () =>
      getPostIds(heavyFollowUser, {
        sort: 'following_new',
        limit: 25,
        time_range: '1w',
      }),
    'following-new-heavy',
  )
  registerScenarioContract('post-search-profile', {
    expectations: [],
    crossPartition: { posts: 'Profile search lists this author posts across id ranges.' },
  })
  await runAndCapture(
    'post-search-profile',
    () => getPostIds(seedUser, { user_id: seedUser.id, limit: 25, time_range: '1w' }),
    'profile',
  )
}
