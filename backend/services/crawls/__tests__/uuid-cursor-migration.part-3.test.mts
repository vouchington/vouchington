import { encodeCursor, encodeScopedPreciseTimestampCursor } from '@modules/pagination'
import { describe, expect, it } from 'vitest'
// Keep static service imports so no-mistakes selects these migration coverage tests
// when any migrated cursor caller changes; dynamic imports execute the cases below.
import '../../rss-feed-items/search-filters.mts'
import '../../topics/search/get-ids-page-info.mts'
import '../../topics/search/get-ids.mts'
import '../../rss-feeds/search-page.mts'
import '../../trending-topics/get-trending-topics.mts'
import '../../urls-hostnames/search-query.mts'
import '../../urls-hostnames/search.mts'
import '../../urls-hostnames/social.mts'
import '../../urls/search.mts'
import '../../user-referral-program-links/get.mts'

const ID = '00000000-0000-4000-8000-000000000001'
const simple = encodeCursor({ id: ID })
const name = encodeCursor({ name: 'cursor-name', id: ID })
const score = encodeCursor({ score: 1, id: ID })
const ranking = encodeCursor({ ranking: 1, id: ID })

const tier = encodeCursor({ tier: 1, id: ID })
const currentUser = { id: ID, roles: [] }

type CursorCase = [string, () => unknown]

function cursorCase(label: string, run: () => unknown): CursorCase {
  return [label, run]
}

const cases: CursorCase[] = [
  cursorCase('buildRssFeedItemFilters', async () =>
    (await import('../../rss-feed-items/search-filters.mts')).buildRssFeedItemFilters({
      after: encodeScopedPreciseTimestampCursor(
        '2024-01-01T00:00:00.000000Z',
        ID,
        (await import('../../rss-feed-items/search-cursor.mts')).getRssFeedItemSearchCursorScope(
          {},
        ),
      ),
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
  cursorCase('getTopicIds link_count', async () =>
    (await import('../../topics/search/get-ids.mts')).getTopicIds({
      sort: 'link_count',
      after: score,
      limit: 1,
    }),
  ),
  cursorCase('decodeRssFeedsCursor trending', async () =>
    (await import('../../rss-feeds/search-page.mts')).decodeRssFeedsCursor(score, 'trending'),
  ),
  cursorCase('decodeRssFeedsCursor default', async () =>
    (await import('../../rss-feeds/search-page.mts')).decodeRssFeedsCursor(simple, undefined),
  ),
  cursorCase('getTrendingTopics', async () =>
    (await import('../../trending-topics/get-trending-topics.mts')).getTrendingTopics({
      after: score,
      limit: 1,
      timeRange: 'day',
    }),
  ),
  cursorCase('buildSearchUrlHostnamesQueryBody trust', async () =>
    (await import('../../urls-hostnames/search-query.mts')).buildSearchUrlHostnamesQueryBody({
      after: score,
      sort: 'trust',
      limit: 1,
    }),
  ),
  cursorCase('buildSearchUrlHostnamesQueryBody name', async () =>
    (await import('../../urls-hostnames/search-query.mts')).buildSearchUrlHostnamesQueryBody({
      after: name,
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
]

describe('migrated UUID cursor services part 3', () => {
  it.each(cases)('does not throw on UUID cursor in %s', async (_name, run) => {
    await expect(Promise.resolve(run())).resolves.toBeDefined()
  })
})
