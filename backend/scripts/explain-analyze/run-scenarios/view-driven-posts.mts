import { SEED_PREFIX, runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { searchPendingPosts } from '@services/communities/publications/get'
import { runPendingReviewDensityScenario } from './pending-review-density.mts'
import { searchCommunityAgentPromptSimulationPosts } from '@services/community-agent-prompts/simulations'
import { getPostIds } from '../run-services.mts'

const EXISTING_COMMUNITY_ID = `${SEED_PREFIX}-1400-7000-8000-000000000000`

export async function runViewDrivenPostScenarios(): Promise<void> {
  const communityId = EXISTING_COMMUNITY_ID
  const scenarios = [
    {
      id: 'search-community-posts',
      description: 'Community search lists posts across the community history.',
      run: () => getPostIds(undefined, { community_id: communityId, limit: 25 }),
    },
    {
      id: 'search-community-posts-1m',
      description: 'Community search lists posts across the community history.',
      run: () => getPostIds(undefined, { community_id: communityId, time_range: '1m', limit: 25 }),
    },
    {
      id: 'search-community-agent-simulation-posts',
      description: 'Simulation scans the community approval window.',
      run: () =>
        searchCommunityAgentPromptSimulationPosts(EXISTING_COMMUNITY_ID, {
          timeWindowHours: 720,
          limit: 25,
        }),
    },
  ] as const
  for (const scenario of scenarios) {
    registerScenarioContract(scenario.id, {
      expectations: [
        ...(scenario.id === 'search-community-agent-simulation-posts'
          ? [
              { kind: 'queryBinds' as const, token: 'candidate_posts' },
              { kind: 'maxProcessedRows' as const, relation: 'community_post_reviews', max: 720 },
              { kind: 'maxProcessedRows' as const, relation: 'posts', max: 1200 },
            ]
          : [
              { kind: 'maxProcessedRows' as const, relation: 'community_post_reviews', max: 720 },
              { kind: 'maxProcessedRows' as const, relation: 'posts', max: 1200 },
            ]),
      ],
      crossPartition: { posts: scenario.description },
    })
    await runAndCapture(
      scenario.id,
      scenario.run,
      undefined,
      scenario.id === 'search-community-agent-simulation-posts'
        ? undefined
        : 'buildPostSearchQuery',
    )
  }

  // The pending page is the review keyset, not the approved candidate_posts CTE.
  // search-pending-posts-dense-approved proves idx_comm_post_reviews__pending.
  registerScenarioContract('search-pending-community-posts', {
    expectations: [
      { kind: 'maxProcessedRows', relation: 'community_post_reviews', max: 720 },
      { kind: 'maxProcessedRows', relation: 'posts', max: 1200 },
    ],
    crossPartition: {
      posts: 'Pending community search lists posts across the community history.',
    },
  })
  await runAndCapture('search-pending-community-posts', () =>
    searchPendingPosts(EXISTING_COMMUNITY_ID, { limit: 25 }),
  )

  await runPendingReviewDensityScenario()
}
