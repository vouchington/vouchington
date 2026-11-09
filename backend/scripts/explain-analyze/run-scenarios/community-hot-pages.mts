import { registerScenarioContract } from '../plan-expectations.mts'
import { POST_DISCOVERY_FIXTURE_SEEDED_ROWS } from '../post-discovery-seeded-rows.mts'
import { getPostIds } from '../run-services.mts'
import { runAndCapture, SEED_PREFIX } from '../run-support.mts'
import { withSeedAnchorClock } from '../seed-clock.mts'

const COMMUNITY_POST_LIMIT = 25
const COMMUNITY_ID = `${SEED_PREFIX}-1400-7000-8000-000000000064`
const COMMUNITY_HOT_GATE = {
  expectations: [
    { kind: 'maxProcessedRows' as const, relation: 'community_post_reviews', max: 2010 },
    { kind: 'maxProcessedRows' as const, relation: 'posts', max: 3010 },
    { kind: 'maxBitmapIndexRows' as const, max: 1050 },
    {
      kind: 'usesIndexes' as const,
      indexes: [
        'posts__default_community_id_case_id_votes_score_sort_idx',
        'posts__default_case_id_votes_score_sort_idx',
        'posts__default_votes_score_sort_id_idx3',
      ],
      anyOf: true,
    },
  ],
  crossPartition: {
    posts: 'Community hot ranking traverses a bounded stable-rank candidate window.',
  },
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

/** Capture only after the late fixture has created its community and review rows. */
export async function runLateCommunityHotScenarios(): Promise<void> {
  const communityHotScenarios = getCommunityHotScenarios(await prepareCommunityHotCursors())
  for (const scenario of communityHotScenarios) {
    registerScenarioContract(scenario.id, {
      ...scenario.contract,
      seededRows: POST_DISCOVERY_FIXTURE_SEEDED_ROWS,
    })
    // no-mistakes-disable-next-line query-reached-per-item: capture both pages separately.
    await runAndCapture(scenario.id, scenario.run, undefined, 'buildPostSearchQuery')
  }
}
