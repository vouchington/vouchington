import { runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { seedUuid } from '../seed-data/common.mts'
import { searchCommunities } from '../run-services.mts'

export async function runCommunitySearchScenarios() {
  // Review caps are the maximum indexed reads in both compare modes and repeat passes +20%.
  // Broad pages: 2,003 → 2,404; selective pages: 403 → 484.
  registerScenarioContract('search-communities', {
    expectations: [
      { kind: 'custom', name: 'searchCommunitiesEligibility' },
      { kind: 'maxProcessedRows', relation: 'community_search_counts', max: 39 },
      { kind: 'maxProcessedRows', relation: 'community_post_reviews', max: 2404 },
      { kind: 'maxProcessedRows', relation: 'communities', max: 1295 },
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
      { kind: 'maxProcessedRows', relation: 'community_search_counts', max: 39 },
      { kind: 'maxProcessedRows', relation: 'community_post_reviews', max: 2404 },
      { kind: 'maxProcessedRows', relation: 'communities', max: 1295 },
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
      { kind: 'maxProcessedRows', relation: 'community_search_counts', max: 348 },
      { kind: 'maxProcessedRows', relation: 'community_post_reviews', max: 484 },
      { kind: 'maxProcessedRows', relation: 'communities', max: 249 },
    ],
  })
  await runAndCapture(
    'search-communities-has-list-items',
    () => searchCommunities({ hasListItems: true, sort: 'virtual_subscriptions', limit: 25 }),
    'has-list-items',
  )

  registerScenarioContract('search-communities-text', {
    expectations: [
      { kind: 'custom', name: 'searchCommunitiesEligibility' },
      { kind: 'custom', name: 'communityTextCandidates' },
      { kind: 'maxProcessedRows', relation: 'communities', max: 692 },
    ],
  })
  await runAndCapture(
    'search-communities-text',
    async () => {
      const page = await searchCommunities({ search: 'seed', sort: 'name', limit: 25 })
      if (page.results.some(community => community.id === seedUuid(5, '14')))
        throw new Error('Public community search returned the private seed community')
    },
    'text',
  )

  registerScenarioContract('search-communities-member', {
    expectations: [
      { kind: 'custom', name: 'searchCommunitiesEligibility' },
      { kind: 'maxProcessedRows', relation: 'community_post_reviews', max: 484 },
      { kind: 'maxProcessedRows', relation: 'communities', max: 245 },
    ],
  })
  await runAndCapture(
    'search-communities-member',
    () => searchCommunities({ memberUserId: seedUser.id, sort: 'name', limit: 25 }),
    'member',
  )
}
