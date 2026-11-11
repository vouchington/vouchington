import { runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import { INELIGIBLE_COLLECTION_PAGE_TOPIC_IDS } from '../seed-data/ineligible-collection-pages.mts'
import { searchCommunities } from '../run-services.mts'
import { runTrendingTextScenarios } from './community-search-trending.mts'

const COMMUNITY_SEARCH_PAGE_SIZE = 25

export async function runCommunitySearchScenarios() {
  await runTrendingTextScenarios()
  // Bounds follow fixture cardinality and page size in both modes and repeat passes:
  // member/virtual pages 26 → 32, listed page 26, ordered text walks 27 → 33 and 33 → 40,
  // member filter 1 → 2. Correlated statistics and key hydration are budgeted independently below.
  registerScenarioContract('search-communities', {
    expectations: [
      { kind: 'custom', name: 'searchCommunitiesEligibility' },
      // 26 rows are the 25-result page plus lookahead from the ordered count index; ceil(26 * 1.2) = 32.
      { kind: 'maxProcessedRows', relation: 'community_search_counts', max: 32 },
      // 2,000.4 indexed review rows; ceil(2,000.4 * 1.2) = 2,401.
      { kind: 'maxProcessedRows', relation: 'community_post_reviews', max: 2401 },
      // 1,052 correlated per-post community-key reads plus 78 candidate/page key reads;
      // ceil(1,130 * 1.2) = 1,356.
      { kind: 'maxProcessedRows', relation: 'communities', max: 1356 },
    ],
  })
  await runAndCapture(
    'search-communities',
    () => searchCommunities({ sort: 'members', limit: 25 }),
    'members',
  )
  registerScenarioContract('search-communities-virtual-subscriptions', {
    expectations: [
      { kind: 'custom', name: 'searchCommunitiesEligibility' },
      // The same 26-result-plus-lookahead count-index page and its 20% bound as the member sort.
      { kind: 'maxProcessedRows', relation: 'community_search_counts', max: 32 },
      { kind: 'maxProcessedRows', relation: 'community_post_reviews', max: 2401 },
      { kind: 'maxProcessedRows', relation: 'communities', max: 1356 },
    ],
  })
  await runAndCapture(
    'search-communities-virtual-subscriptions',
    () => searchCommunities({ sort: 'virtual_subscriptions', limit: 25 }),
    'virtual-subscriptions',
  )
  registerScenarioContract('search-communities-has-list-items', {
    expectations: [
      { kind: 'custom', name: 'searchCommunitiesEligibility' },
      // The listed-community index supplies the page and lookahead; candidates remain keyed.
      {
        kind: 'maxProcessedRows',
        relation: 'community_search_counts',
        max: COMMUNITY_SEARCH_PAGE_SIZE + 1,
      },
      { kind: 'maxProcessedRows', relation: 'community_post_reviews', max: 484 },
      // One selected community has 252 posts linked through its approved/pending review
      // fixtures (200 base reviews + 50 #3018 view-driven rows + 2 search rows). The
      // correlated view checks perform one indexed community-key lookup per post, plus
      // three page-candidate/hydration lookups: 255 measured rows, with 20% headroom.
      { kind: 'maxProcessedRows', relation: 'communities', max: 306 },
    ],
  })
  await runAndCapture(
    'search-communities-has-list-items',
    () =>
      searchCommunities({
        hasListItems: true,
        sort: 'virtual_subscriptions',
        limit: COMMUNITY_SEARCH_PAGE_SIZE,
      }),
    'has-list-items',
  )

  registerScenarioContract('search-communities-topic-pair', {
    expectations: [
      { kind: 'custom', name: 'searchCommunitiesEligibility' },
      // Two matching communities each probe two terms through the live unique key.
      { kind: 'maxProcessedRows', relation: 'community_list_topics', max: 4 },
    ],
  })
  await runAndCapture('search-communities-topic-pair', async () => {
    const page = await searchCommunities({
      topicIds: INELIGIBLE_COLLECTION_PAGE_TOPIC_IDS.slice(0, 2),
      sort: 'name',
      limit: COMMUNITY_SEARCH_PAGE_SIZE,
    })
    if (!page.results.some(community => community.id === seedUuid(9, '14')))
      throw new Error('All-of community topic search omitted its seeded pair')
  })

  registerScenarioContract('search-communities-text', {
    expectations: [
      { kind: 'custom', name: 'searchCommunitiesEligibility' },
      // Name order reads the private slug hit plus one 25-result page: 27 rows, ceil(27 * 1.2) = 33.
      { kind: 'custom', name: 'communityTextCandidates' },
      // The ordered page is smaller than the plain member page, whose metric hydration already
      // accounts for 1,052 correlated post reads plus 78 key lookups: ceil(1,130 * 1.2) = 1,356.
      { kind: 'maxProcessedRows', relation: 'communities', max: 1356 },
    ],
  })
  await runAndCapture(
    'search-communities-text',
    async () => {
      const page = await searchCommunities({ search: 'explain', sort: 'name', limit: 25 })
      if (page.results.some(community => community.id === seedUuid(5, '14')))
        throw new Error('Public community search returned the private seed community')
    },
    'text',
  )
  registerScenarioContract('search-communities-text-members', {
    expectations: [
      { kind: 'custom', name: 'searchCommunitiesEligibility' },
      // The ordered count walk read 33 rows to return 26; ceil(33 * 1.2) = 40.
      { kind: 'custom', name: 'communityTextCandidates' },
      { kind: 'maxProcessedRows', relation: 'community_search_counts', max: 40 },
      { kind: 'maxProcessedRows', relation: 'communities', max: 1356 },
    ],
  })
  await runAndCapture(
    'search-communities-text-members',
    () => searchCommunities({ search: 'explain', sort: 'members', limit: 25 }),
    'text-members',
  )
  registerScenarioContract('search-communities-text-virtual-subscriptions', {
    expectations: [
      { kind: 'custom', name: 'searchCommunitiesEligibility' },
      // The ordered subscription walk read 33 rows to return 26; ceil(33 * 1.2) = 40.
      { kind: 'custom', name: 'communityTextCandidates' },
      { kind: 'maxProcessedRows', relation: 'community_search_counts', max: 40 },
      { kind: 'maxProcessedRows', relation: 'communities', max: 1356 },
    ],
  })
  await runAndCapture(
    'search-communities-text-virtual-subscriptions',
    () => searchCommunities({ search: 'explain', sort: 'virtual_subscriptions', limit: 25 }),
    'text-virtual-subscriptions',
  )

  registerScenarioContract('search-communities-member', {
    expectations: [
      { kind: 'custom', name: 'searchCommunitiesEligibility' },
      { kind: 'custom', name: 'searchCommunityMemberCandidates' },
      // One matching membership row; the node-level custom gate enforces ceil(1 * 1.2) = 2.
      { kind: 'maxProcessedRows', relation: 'community_post_reviews', max: 484 },
      // The same 252-post community and three keyed candidate/page lookups described above.
      { kind: 'maxProcessedRows', relation: 'communities', max: 306 },
    ],
  })
  await runAndCapture(
    'search-communities-member',
    () => searchCommunities({ memberUserId: seedUser.id, sort: 'name', limit: 25 }),
    'member',
  )
}
