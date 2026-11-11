import { registerScenarioContract } from '../plan-expectations.mts'
import { partitionIndexLeaves } from '../partition-index-leaves.mts'
import { POST_DISCOVERY_FIXTURE_SEEDED_ROWS } from '../post-discovery-seeded-rows.mts'
import { getPostIds } from '../run-services.mts'
import { runAndCapture, SEED_PREFIX } from '../run-support.mts'
import { withSeedAnchorClock } from '../seed-clock.mts'

const COMMUNITY_POST_LIMIT = 25
const COMMUNITY_ID = `${SEED_PREFIX}-1400-7000-8000-000000000064`
const COMMUNITY_HOT_INDEX = 'idx_posts__community_id__stable_hot_rank__id'

function communityHotGate(leaves: readonly string[]) {
  return {
    expectations: [
      { kind: 'queryBinds' as const, token: 'candidate_posts' },
      { kind: 'maxProcessedRows' as const, relation: 'community_post_reviews', max: 720 },
      { kind: 'maxProcessedRows' as const, relation: 'posts', max: 1200 },
      { kind: 'usesIndexes' as const, indexes: leaves, anyOf: true },
    ],
    crossPartition: {
      posts: 'Community hot ranking traverses the retained post history with cursor continuation.',
    },
  }
}

type CommunityHotCursor = Readonly<{ after: string; firstPageIds: readonly string[] }>

type CommunityHotScenario = Readonly<{
  id: string
  run: () => Promise<unknown>
  contract: Parameters<typeof registerScenarioContract>[1]
}>

async function prepareCommunityHotCursor(timeRange?: '1m'): Promise<CommunityHotCursor> {
  const page = await getPostIds(undefined, {
    community_id: COMMUNITY_ID,
    sort: 'hot',
    ...(timeRange ? { time_range: timeRange } : {}),
    limit: COMMUNITY_POST_LIMIT,
  })
  const after = page.page_info.end_cursor
  if (page.results.length !== COMMUNITY_POST_LIMIT || !page.page_info.has_next_page || !after)
    throw new Error('Community hot fixture must return a full first page and continuation')
  return { after, firstPageIds: page.results.map(post => post.id) }
}

async function prepareCommunityHotCursors(): Promise<{
  all: CommunityHotCursor
  month: CommunityHotCursor
}> {
  return withSeedAnchorClock(async () => ({
    all: await prepareCommunityHotCursor(),
    month: await prepareCommunityHotCursor('1m'),
  }))
}

async function runCommunityHotPage(
  timeRange: '1m' | undefined,
  cursor: CommunityHotCursor | undefined,
  label: string,
): Promise<void> {
  await withSeedAnchorClock(async () => {
    const page = await getPostIds(undefined, {
      community_id: COMMUNITY_ID,
      sort: 'hot',
      ...(timeRange ? { time_range: timeRange } : {}),
      limit: COMMUNITY_POST_LIMIT,
      ...(cursor ? { after: cursor.after } : {}),
    })
    if (page.results.length !== COMMUNITY_POST_LIMIT || !page.page_info.has_next_page)
      throw new Error(`Community hot ${label} must return a full page with another page`)
    if (cursor && page.results.some(post => cursor.firstPageIds.includes(post.id)))
      throw new Error('Community hot continuation must contain only new post IDs')
  })
}

function getCommunityHotScenarios(
  cursors: Awaited<ReturnType<typeof prepareCommunityHotCursors>>,
  leaves: readonly string[],
): readonly CommunityHotScenario[] {
  const contract = communityHotGate(leaves)
  return [
    {
      id: 'search-community-posts-hot',
      run: () => runCommunityHotPage(undefined, undefined, 'first page'),
      contract,
    },
    {
      id: 'search-community-posts-hot-after',
      run: () => runCommunityHotPage(undefined, cursors.all, 'continuation'),
      contract,
    },
    {
      id: 'search-community-posts-hot-1m',
      run: () => runCommunityHotPage('1m', undefined, 'first page'),
      contract,
    },
    {
      id: 'search-community-posts-hot-1m-after',
      run: () => runCommunityHotPage('1m', cursors.month, 'continuation'),
      contract,
    },
  ]
}

/** Capture only after the late fixture has created its community and review rows. */
export async function runLateCommunityHotScenarios(): Promise<void> {
  const communityHotScenarios = getCommunityHotScenarios(
    await prepareCommunityHotCursors(),
    await partitionIndexLeaves(COMMUNITY_HOT_INDEX),
  )
  for (const scenario of communityHotScenarios) {
    registerScenarioContract(scenario.id, {
      ...scenario.contract,
      seededRows: POST_DISCOVERY_FIXTURE_SEEDED_ROWS,
    })
    // no-mistakes-disable-next-line query-reached-per-item: capture both pages separately.
    await runAndCapture(scenario.id, scenario.run, undefined, 'buildPostSearchQuery')
  }
}
