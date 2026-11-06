import { SEED_PREFIX, runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { searchCommunityPosts, searchPendingPosts } from '@services/communities/publications/get'
import { runPendingReviewDensityScenario } from './pending-review-density.mts'
import { searchCommunityAgentPromptSimulationPosts } from '@services/community-agent-prompts/simulations'
import { withSeedAnchorClock } from '../seed-clock.mts'

const COMMUNITY_POST_LIMIT = 25
const COMMUNITY_ID = `${SEED_PREFIX}-1400-7000-8000-000000000000`
const COMMUNITY_HOT_GATE = {
  expectations: [
    { kind: 'queryBinds' as const, token: 'candidate_posts' },
    { kind: 'maxProcessedRows' as const, relation: 'community_post_reviews', max: 720 },
    { kind: 'maxProcessedRows' as const, relation: 'posts', max: 1200 },
  ],
  crossPartition: {
    posts: 'Community hot ranking traverses the retained post history with cursor continuation.',
  },
}

type CommunityHotCursor = Readonly<{
  after: string
  firstPageIds: readonly string[]
}>

export type CommunityHotCursors = Readonly<{
  all: CommunityHotCursor
  month: CommunityHotCursor
}>

type CommunityHotScenario = Readonly<{
  id: string
  run: () => Promise<unknown>
  contract: Parameters<typeof registerScenarioContract>[1]
}>

async function prepareCommunityHotCursor(timeRange?: '1m'): Promise<CommunityHotCursor> {
  const page = await searchCommunityPosts(COMMUNITY_ID, {
    sort: 'hot',
    ...(timeRange ? { time_range: timeRange } : {}),
    limit: COMMUNITY_POST_LIMIT,
  })
  const after = page.page_info.end_cursor
  if (page.results.length !== COMMUNITY_POST_LIMIT || !page.page_info.has_next_page || !after)
    throw new Error('Community hot fixture must return a full first page and continuation')
  return { after, firstPageIds: page.results.map(post => post.id) }
}

export async function prepareCommunityHotCursors(): Promise<CommunityHotCursors> {
  return withSeedAnchorClock(async () => ({
    all: await prepareCommunityHotCursor(),
    month: await prepareCommunityHotCursor('1m'),
  }))
}

export function getCommunityHotScenarios(
  cursors: CommunityHotCursors,
): readonly CommunityHotScenario[] {
  return [
    {
      id: 'search-community-posts-hot',
      run: () => runCommunityHotPage(undefined, undefined, 'first page'),
      contract: COMMUNITY_HOT_GATE,
    },
    {
      id: 'search-community-posts-hot-after',
      run: () => runCommunityHotPage(undefined, cursors.all, 'continuation'),
      contract: COMMUNITY_HOT_GATE,
    },
    {
      id: 'search-community-posts-hot-1m',
      run: () => runCommunityHotPage('1m', undefined, 'first page'),
      contract: COMMUNITY_HOT_GATE,
    },
    {
      id: 'search-community-posts-hot-1m-after',
      run: () => runCommunityHotPage('1m', cursors.month, 'continuation'),
      contract: COMMUNITY_HOT_GATE,
    },
  ]
}

async function runCommunityHotPage(
  timeRange: '1m' | undefined,
  cursor: CommunityHotCursor | undefined,
  label: string,
): Promise<void> {
  await withSeedAnchorClock(async () => {
    const page = await searchCommunityPosts(COMMUNITY_ID, {
      sort: 'hot',
      ...(timeRange ? { time_range: timeRange } : {}),
      limit: COMMUNITY_POST_LIMIT,
      ...(cursor ? { after: cursor.after } : {}),
    })
    assertCommunityHotPage(page, label)
    if (cursor && page.results.some(post => cursor.firstPageIds.includes(post.id)))
      throw new Error('Community hot continuation must contain only new post IDs')
  })
}

function assertCommunityHotPage(
  page: Awaited<ReturnType<typeof searchCommunityPosts>>,
  label: string,
): void {
  if (page.results.length !== COMMUNITY_POST_LIMIT || !page.page_info.has_next_page)
    throw new Error(`Community hot ${label} must be a full page with another page`)
}

export async function runViewDrivenPostScenarios(): Promise<void> {
  const communityId = `${SEED_PREFIX}-1400-7000-8000-000000000000`
  const scenarios = [
    {
      id: 'search-community-posts',
      description: 'Community search lists posts across the community history.',
      run: () => searchCommunityPosts(communityId, { limit: 25 }),
    },
    {
      id: 'search-community-posts-1m',
      description: 'Community search lists posts across the community history.',
      run: () => searchCommunityPosts(communityId, { time_range: '1m', limit: 25 }),
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
    // no-mistakes-disable-next-line query-reached-per-item: independent plan capture.
    await runAndCapture(scenario.id, scenario.run)
  }

  const communityHotScenarios = getCommunityHotScenarios(await prepareCommunityHotCursors())
  for (const scenario of communityHotScenarios) {
    registerScenarioContract(scenario.id, scenario.contract)
    // no-mistakes-disable-next-line query-reached-per-item: capture both pages separately.
    await runAndCapture(scenario.id, scenario.run)
  }
  await runPendingReviewDensityScenario()
}
