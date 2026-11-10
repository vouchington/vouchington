import { getPostIds, getPostFeedIds } from '../run-services.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { withSeedAnchorClock } from '../seed-clock.mts'
import { seedVoteScorePostHotFixture } from '../seed-data/vote-score-post-hot.mts'

const PAGE_SIZE = 25
const WEEKLY_POST_SCAN_CAP = 15_000

export type VoteScorePostHotCursors = Readonly<{ search: string; feed: string; trending: string }>
type RankedPage = {
  results: unknown[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}
const postScanGate = () => [
  { kind: 'maxProcessedRows' as const, relation: 'posts', max: WEEKLY_POST_SCAN_CAP },
]
async function prepareCursor<T extends RankedPage>(
  label: string,
  loadFirstPage: () => Promise<T>,
): Promise<string> {
  const page = await loadFirstPage()
  const cursor = page.page_info.end_cursor
  if (
    !cursor ||
    !page.page_info.has_next_page ||
    page.results.length !== PAGE_SIZE
  )
    throw new Error(`${label} hot-ranking fixture must stay bounded and return a continuation`)
  return cursor
}
export async function prepareVoteScorePostHotCursors(): Promise<VoteScorePostHotCursors> {
  return withSeedAnchorClock(async () => ({
    search: await prepareCursor('Post search', () =>
      getPostIds(seedUser, { sort: 'hot', limit: PAGE_SIZE, time_range: '1w' }),
    ),
    feed: await prepareCursor('Post feed', () =>
      getPostFeedIds(seedUser, {
        sort: 'hot',
        feed_type: 'any',
        limit: PAGE_SIZE,
        time_range: '1w',
      }),
    ),
    trending: await prepareCursor('Trending posts', () =>
      getPostIds(undefined, { sort: 'trending', time_range: '1w', limit: PAGE_SIZE }),
    ),
  }))
}
async function requireContinuation<T extends RankedPage>(
  label: string,
  load: () => Promise<T>,
  after?: string,
): Promise<T> {
  const page = await load()
  if (
    !page.page_info.end_cursor ||
    !page.page_info.has_next_page ||
    page.results.length !== PAGE_SIZE ||
    (after !== undefined && page.page_info.end_cursor === after)
  )
    throw new Error(`${label} hot-ranking continuation must stay bounded and advance its cursor`)
  return page
}

function contractForScenario(id: string): Parameters<typeof registerScenarioContract>[1] {
  const feed = id.startsWith('vote-score-post-feed-hot-')
  const topicRelations = [
    'relation__post__category__topic',
    'relation__post__category__topic_alias',
    'topic_aliases',
  ]
  return {
    expectations: [
      ...postScanGate(),
      ...(feed ? [{ kind: 'custom' as const, name: 'postTopicMembership' }] : []),
      // Follow and mute can each inspect a candidate's topic children.
      ...(feed
        ? topicRelations.map(relation => ({
            kind: 'maxProcessedRows' as const,
            relation,
            max: WEEKLY_POST_SCAN_CAP * 2,
          }))
        : []),
    ],
    forbidSequentialScans: feed ? topicRelations : [],
    crossPartition: {
      posts: 'Hot ranking traverses eligible positive-score posts across the requested week.',
    },
  }
}
export async function runVoteScorePostHotScenarios(): Promise<void> {
  await seedVoteScorePostHotFixture()
  const cursors = await prepareVoteScorePostHotCursors()
  const scenarios = getVoteScorePostHotScenarios(cursors)

  for (const scenario of scenarios) {
    registerScenarioContract(scenario.id, scenario.contract)
    // no-mistakes-disable-next-line query-reached-per-item: each ranking entrypoint has its own plan contract.
    await runAndCapture(scenario.id, scenario.run)
  }
}

export type VoteScorePostHotScenario = Readonly<{
  id: string
  run: () => Promise<unknown>
  contract: Parameters<typeof registerScenarioContract>[1]
}>

export function getVoteScorePostHotScenarios(
  cursors: VoteScorePostHotCursors,
): readonly VoteScorePostHotScenario[] {
  return [
    {
      id: 'vote-score-post-search-hot-first',
      run: () => getPostIds(seedUser, { sort: 'hot', limit: PAGE_SIZE, time_range: '1w' }),
    },
    {
      id: 'vote-score-post-search-hot-after',
      run: () =>
        requireContinuation('Post search', () =>
          getPostIds(seedUser, {
            sort: 'hot',
            limit: PAGE_SIZE,
            time_range: '1w',
            after: cursors.search,
          }),
        ),
    },
    {
      id: 'vote-score-post-feed-hot-first',
      run: () =>
        getPostFeedIds(seedUser, {
          sort: 'hot',
          feed_type: 'any',
          limit: PAGE_SIZE,
          time_range: '1w',
        }),
    },
    {
      id: 'vote-score-post-feed-hot-after',
      run: () =>
        requireContinuation('Post feed', () =>
          getPostFeedIds(seedUser, {
            sort: 'hot',
            feed_type: 'any',
            limit: PAGE_SIZE,
            time_range: '1w',
            after: cursors.feed,
          }),
          cursors.feed,
        ),
    },
    {
      id: 'vote-score-trending-posts-first',
      run: () => getPostIds(undefined, { sort: 'trending', time_range: '1w', limit: PAGE_SIZE }),
    },
    {
      id: 'vote-score-trending-posts-after',
      run: () =>
        requireContinuation('Trending posts', () =>
          getPostIds(undefined, {
            sort: 'trending',
            time_range: '1w',
            limit: PAGE_SIZE,
            after: cursors.trending,
          }),
        ),
    },
  ].map(scenario => ({ ...scenario, contract: contractForScenario(scenario.id) }))
}
