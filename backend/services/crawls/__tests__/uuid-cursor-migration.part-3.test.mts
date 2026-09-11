import { encodeCursor } from '@modules/pagination'
import { describe, expect, it } from 'vitest'
// Keep static service imports so no-mistakes selects these migration coverage tests
// when any migrated cursor caller changes; dynamic imports execute the cases below.
import '../../rss-feed-items/search-filters.mts'
import '../../topics/search/get-ids-page-info.mts'
import '../../trending-communities/get-trending-communities.mts'
import '../../trending-posts/get-trending-posts.mts'
import '../../trending-referral-programs/get-trending-referral-programs.mts'
import '../../trending-rss-feeds/get-trending-rss-feeds.mts'
import '../../trending-topics/get-trending-topics.mts'
import '../../urls-hostnames/search-query.mts'
import '../../urls-hostnames/search-top.mts'
import '../../urls-hostnames/search.mts'
import '../../urls-hostnames/social.mts'
import '../../urls/search.mts'
import '../../user-referral-program-links/get.mts'
import '../../vote-integrity/get-flags.mts'
import '../../vote-integrity/get-penalties.mts'
import '../../wikipedia-topic-recommendations/search-topic-recommendations.mts'

const ID = '00000000-0000-4000-8000-000000000001'
const simple = encodeCursor({ id: ID })
const name = encodeCursor({ name: 'cursor-name', id: ID })
const score = encodeCursor({ score: 1, id: ID })
const ranking = encodeCursor({ ranking: 1, id: ID })
const timestamp = encodeCursor({ timestamp: Date.UTC(2024, 0, 1), id: ID })
const tier = encodeCursor({ tier: 1, id: ID })
const currentUser = { id: ID, roles: [] }

type CursorCase = [string, () => unknown | Promise<unknown>]

function cursorCase(label: string, run: () => unknown | Promise<unknown>): CursorCase {
  return [label, run]
}

const cases: CursorCase[] = [
  cursorCase('buildRssFeedItemFilters', async () =>
    (await import('../../rss-feed-items/search-filters.mts')).buildRssFeedItemFilters({
      after: timestamp,
    }),
  ),
  cursorCase('decodeTopicSearchCursor text relevance', async () =>
    (await import('../../topics/search/get-ids-page-info.mts')).decodeTopicSearchCursor(
      { after: tier },
      'relevance',
      { hasTextSearch: true, useSemanticRelevanceRanking: false } as never,
    ),
  ),
  cursorCase('decodeTopicSearchCursor semantic relevance', async () =>
    (await import('../../topics/search/get-ids-page-info.mts')).decodeTopicSearchCursor(
      { after: ranking },
      'relevance',
      { hasTextSearch: false, useSemanticRelevanceRanking: true } as never,
    ),
  ),
  cursorCase('decodeTopicSearchCursor best', async () =>
    (await import('../../topics/search/get-ids-page-info.mts')).decodeTopicSearchCursor(
      { after: score },
      'best',
      { hasTextSearch: false, useSemanticRelevanceRanking: false } as never,
    ),
  ),
  cursorCase('decodeTopicSearchCursor relevance simple', async () =>
    (await import('../../topics/search/get-ids-page-info.mts')).decodeTopicSearchCursor(
      { after: simple },
      'relevance',
      { hasTextSearch: false, useSemanticRelevanceRanking: false } as never,
    ),
  ),
  cursorCase('decodeTopicSearchCursor default simple', async () =>
    (await import('../../topics/search/get-ids-page-info.mts')).decodeTopicSearchCursor(
      { after: simple },
      'new',
      { hasTextSearch: false, useSemanticRelevanceRanking: false } as never,
    ),
  ),
  cursorCase('getTrendingCommunities', async () =>
    (
      await import('../../trending-communities/get-trending-communities.mts')
    ).getTrendingCommunities({
      after: score,
      limit: 1,
    }),
  ),
  cursorCase('getTrendingPosts', async () =>
    (await import('../../trending-posts/get-trending-posts.mts')).getTrendingPosts({
      after: score,
      limit: 1,
      timeRange: 'day',
    }),
  ),
  cursorCase('getTrendingReferralPrograms', async () =>
    (
      await import('../../trending-referral-programs/get-trending-referral-programs.mts')
    ).getTrendingReferralPrograms({ after: score, limit: 1 }),
  ),
  cursorCase('getTrendingRssFeeds', async () =>
    (await import('../../trending-rss-feeds/get-trending-rss-feeds.mts')).getTrendingRssFeeds({
      after: score,
      limit: 1,
      timeRange: 'day',
    }),
  ),
  cursorCase('getTrendingTopics', async () =>
    (await import('../../trending-topics/get-trending-topics.mts')).getTrendingTopics({
      after: score,
      limit: 1,
      timeRange: 'day',
    }),
  ),
  cursorCase('buildSearchUrlHostnamesQuery trust', async () =>
    (await import('../../urls-hostnames/search-query.mts')).buildSearchUrlHostnamesQuery({
      after: score,
      sort: 'trust',
      limit: 1,
    }),
  ),
  cursorCase('buildSearchUrlHostnamesQuery name', async () =>
    (await import('../../urls-hostnames/search-query.mts')).buildSearchUrlHostnamesQuery({
      after: name,
      limit: 1,
    }),
  ),
  cursorCase('searchTopHostnames', async () =>
    (await import('../../urls-hostnames/search-top.mts')).searchTopHostnames({
      after: score,
      limit: 1,
    }),
  ),
  cursorCase('searchBlockedHostnames', async () =>
    (await import('../../urls-hostnames/search.mts')).searchBlockedHostnames({
      after: name,
      limit: 1,
    }),
  ),
  cursorCase('getFriendTrustedHostnames', async () =>
    (await import('../../urls-hostnames/social.mts')).getFriendTrustedHostnames(ID, {
      after: score,
      limit: 1,
    }),
  ),
  cursorCase('searchUrls', async () =>
    (await import('../../urls/search.mts')).searchUrls({ after: simple, limit: 1 }),
  ),
  cursorCase('getUserReferralLinks', async () =>
    (await import('../../user-referral-program-links/get.mts')).getUserReferralLinks(
      currentUser as never,
      ID,
      { after: simple, limit: 1 },
    ),
  ),
  cursorCase('getVoteIntegrityFlags', async () =>
    (await import('../../vote-integrity/get-flags.mts')).getVoteIntegrityFlags({
      after: simple,
      limit: 1,
    }),
  ),
  cursorCase('getVoteWeightPenalties', async () =>
    (await import('../../vote-integrity/get-penalties.mts')).getVoteWeightPenalties({
      after: simple,
      limit: 1,
    }),
  ),
  cursorCase('searchTopicRecommendations', async () =>
    (
      await import('../../wikipedia-topic-recommendations/search-topic-recommendations.mts')
    ).searchTopicRecommendations({ after: score, limit: 1 }),
  ),
]

describe('migrated UUID cursor services part 3', () => {
  it.each(cases)('does not throw on UUID cursor in %s', async (_name, run) => {
    await expect(Promise.resolve(run())).resolves.toBeDefined()
  })

  it('rejects malformed UUID cursors in representative migrated services', async () => {
    await expect(
      (await import('../../trending-posts/get-trending-posts.mts')).getTrendingPosts({
        after: 'not-valid-base64!!!',
        limit: 1,
        timeRange: 'day',
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Invalid cursor format'),
    })
  })

  it('rejects non-UUID cursor ids in representative migrated services', async () => {
    await expect(
      (await import('../../trending-posts/get-trending-posts.mts')).getTrendingPosts({
        after: encodeCursor({ score: 1, id: 'not-a-uuid' }),
        limit: 1,
        timeRange: 'day',
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Invalid cursor: id is not a valid UUID',
    })
  })
})
