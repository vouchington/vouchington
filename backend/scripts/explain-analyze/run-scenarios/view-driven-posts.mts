import { SEED_PREFIX, runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import {
  searchCommunityPosts,
  searchPendingPosts,
} from '../../../services/communities/publications/get.mts'
import { searchCommunityAgentPromptSimulationPosts } from '../../../services/community-agent-prompts/simulations.mts'

export async function runViewDrivenPostScenarios(): Promise<void> {
  const communityId = `${SEED_PREFIX}-1400-7000-8000-000000000000`
  const scenarios = [
    {
      id: 'search-community-posts',
      description: 'Community search lists posts across the community history.',
      run: () => searchCommunityPosts(communityId, { limit: 25 }),
    },
    {
      id: 'search-community-posts-hot',
      description: 'Community hot ranking spans its retained post history.',
      run: () => searchCommunityPosts(communityId, { sort: 'hot', limit: 25 }),
    },
    {
      id: 'search-pending-community-posts',
      description: 'Pending community search lists posts across the community history.',
      run: () => searchPendingPosts(communityId, { limit: 25 }),
    },
    {
      id: 'search-community-agent-simulation-posts',
      description: 'Simulation scans the community approval window.',
      run: () =>
        searchCommunityAgentPromptSimulationPosts(communityId, { timeWindowHours: 720, limit: 25 }),
    },
  ] as const
  for (const scenario of scenarios) {
    registerScenarioContract(scenario.id, {
      expectations: [
        { kind: 'queryBinds', token: 'candidate_posts' },
        { kind: 'maxProcessedRows', relation: 'community_post_reviews', max: 720 },
        { kind: 'maxProcessedRows', relation: 'posts', max: 1200 },
      ],
      crossPartition: { posts: scenario.description },
    })
    // no-mistakes-disable-next-line query-reached-per-item: four fixed, separately named EXPLAIN scenarios need independent captures
    await runAndCapture(scenario.id, scenario.run)
  }
}
