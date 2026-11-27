import assert from 'node:assert/strict'
import { getCommunityListItemStorageConfig } from '@services/communities/list-items/catalog'
import {
  getCommunityListItemCounts,
  searchCommunityListItems,
} from '@services/communities/list-items/get'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  COMMUNITY_URL_PAGE_MAX,
  seedCommunityUrlFeedLists,
} from '../seed-data/community-url-feed-list-capacity.mts'
import { ownedCommunities } from '../seed-data/owned-communities.mts'

const LIST_QUERY = 'searchCommunityListItems'
const COUNT_QUERY = 'getCommunityListItemCounts'
const RSS_PAGE_DEFAULT = 20

async function captureMembershipPages(
  communityId: string,
  kind: 'url' | 'rss_feed',
  scenario: string,
  expectedIds: string[],
  size: number,
) {
  const { table } = getCommunityListItemStorageConfig(kind)
  const pages = Math.ceil(expectedIds.length / size)
  registerScenarioContract(scenario, {
    expectations: Array.from({ length: pages }, (_, captureIndex) => ({
      kind: 'maxProcessedRows',
      relation: table,
      captureIndex,
      max: Math.min(size + 1, expectedIds.length - captureIndex * size),
    })),
  })
  await runAndCapture(
    scenario,
    async () => {
      let after: string | undefined
      for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
        const page = await searchCommunityListItems(communityId, kind, {
          limit: kind === 'url' ? size : undefined,
          after,
        })
        assert.deepEqual(
          page.results.map(row => row.id),
          expectedIds.slice(pageIndex * size, (pageIndex + 1) * size),
        )
        assert.equal(page.page_info.has_next_page, pageIndex < pages - 1)
        if (pageIndex < pages - 1) assert(page.page_info.end_cursor)
        else assert.equal(page.page_info.end_cursor, null)
        after = page.page_info.end_cursor ?? undefined
      }
    },
    undefined,
    LIST_QUERY,
    { exactCapturedNames: Array.from({ length: pages }, () => LIST_QUERY) },
  )
}

async function captureMembershipCounts(
  communityId: string,
  feedCap: number,
  hostnameMemberships: number,
) {
  const scenario = 'community-curated-list-counts-at-cap'
  registerScenarioContract(scenario, {
    // Main's generic plan can visit the entire hostname-membership table.
    // https://github.com/vouchington/vouchington/issues/6374#issuecomment-7188884262
    expectations: [
      {
        kind: 'maxProcessedRows',
        relation: 'community_list_urls',
        max: COMMUNITY_URL_PAGE_MAX + 1,
      },
      { kind: 'maxProcessedRows', relation: 'community_list_rss_feeds', max: feedCap },
      { kind: 'maxProcessedRows', relation: 'community_list_topics', max: 2 },
      { kind: 'maxProcessedRows', relation: 'community_list_posts', max: 1 },
      {
        kind: 'maxProcessedRows',
        relation: 'community_list_url_hostnames',
        max: hostnameMemberships,
      },
    ],
  })
  await runAndCapture(
    scenario,
    async () => {
      assert.deepEqual(await getCommunityListItemCounts(communityId), {
        topic: 1,
        rss_feed: feedCap,
        post: 1,
        url_hostname: 1,
        url: COMMUNITY_URL_PAGE_MAX + 1,
      })
    },
    undefined,
    COUNT_QUERY,
    { exactCapturedNames: [COUNT_QUERY] },
  )
}

export async function runCommunityUrlFeedListCapacity(): Promise<void> {
  const fixture = ownedCommunities(13)
  const communityId = fixture.ids[0]!
  try {
    await fixture.seed()
    const { urlIds, rssFeedIds, feedCap, hostnameMemberships } = await seedCommunityUrlFeedLists(
      fixture.ids,
    )
    assert.equal(urlIds.length, COMMUNITY_URL_PAGE_MAX + 1)
    assert.equal(feedCap, 50)
    assert.equal(rssFeedIds.length, feedCap)
    await captureMembershipPages(
      communityId,
      'url',
      'community-curated-url-list-at-cap',
      urlIds,
      COMMUNITY_URL_PAGE_MAX,
    )
    await captureMembershipPages(
      communityId,
      'rss_feed',
      'community-curated-feed-list-at-cap',
      rssFeedIds,
      RSS_PAGE_DEFAULT,
    )
    await captureMembershipCounts(communityId, feedCap, hostnameMemberships)
  } finally {
    await fixture.cleanup()
  }
}
