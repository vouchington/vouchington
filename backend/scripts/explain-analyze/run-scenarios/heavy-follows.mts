import { heavyFollowUser, runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { getPostFeedIds, getPostIds, getRssFeedItemFeedIds } from '../run-services.mts'
import {
  registerRssFeedPageScenario,
  runRssFeedFirstAndContinuationScenarios,
} from './rss-feed-pages.mts'
import { runRssFeedWeeklyPagedScenarios } from './rss-feed-weekly-paged.mts'
import { runRssFeedWeeklyFilterScenarios } from './rss-feed-weekly-filters.mts'
import { runRssFeedWeeklyProxyScenario } from './rss-feed-weekly-proxy.mts'

export async function runHeavyFollowScenarios() {
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
    async () => {
      const page = await getPostFeedIds(heavyFollowUser, {
        sort: 'hot',
        limit: 25,
        time_range: '1w',
      })
      if (page.results.length > 25 || !page.page_info.has_next_page || !page.page_info.end_cursor)
        throw new Error('Heavy hot feed must stay within its page limit and advance its cursor')
    },
    'heavy-hot',
  )

  await runRssFeedFirstAndContinuationScenarios(
    'rss-feed-item-feed-heavy-follows',
    heavyFollowUser,
    { limit: 25, time_range: '1w' },
    'heavy',
  )
  registerRssFeedPageScenario('rss-feed-item-feed-heavy-follow-rss-feeds')
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
  registerRssFeedPageScenario('rss-feed-item-feed-heavy-follow-topics')
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
  registerRssFeedPageScenario('rss-feed-item-feed-heavy-all')
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
  await runRssFeedWeeklyPagedScenarios()
  await runRssFeedWeeklyFilterScenarios()
  await runRssFeedWeeklyProxyScenario()

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
