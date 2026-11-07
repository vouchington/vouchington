import { getPostIds, getPostFeedIds, getTrendingPosts } from '../run-services.mts'
import { runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { withSeedAnchorClock } from '../seed-clock.mts'
import { seedVoteScorePostHotFixture } from '../seed-data/vote-score-post-hot.mts'

const PAGE_SIZE = 25
const WEEKLY_POST_SCAN_CAP = 15_000

export type VoteScorePostHotCursors = Readonly<{
  search: string
  feed: string
  trending: string
}>
type RankedPage = {
  results: unknown[]
  page_info: { has_next_page: boolean; end_cursor: string | null }
}

function postScanGate() {
  return [{ kind: 'maxProcessedRows' as const, relation: 'posts', max: WEEKLY_POST_SCAN_CAP }]
}

async function prepareCursor<T extends RankedPage>(
  label: string,
  loadFirstPage: () => Promise<T>,
): Promise<string> {
  const page = await loadFirstPage()
  const cursor = page.page_info.end_cursor
  if (page.results.length !== PAGE_SIZE || !page.page_info.has_next_page || !cursor)
    throw new Error(`${label} hot-ranking fixture must have a full first page and continuation`)
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
      getTrendingPosts({ timeRange: 'week', limit: PAGE_SIZE }),
    ),
  }))
}

async function requireContinuation<
  T extends { results: unknown[]; page_info: { has_next_page: boolean } },
>(label: string, load: () => Promise<T>): Promise<T> {
  const page = await load()
  if (page.results.length !== PAGE_SIZE || !page.page_info.has_next_page)
    throw new Error(`${label} hot-ranking continuation must return a full page with another page`)
  return page
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
        ),
    },
    {
      id: 'vote-score-trending-posts-first',
      run: () => getTrendingPosts({ timeRange: 'week', limit: PAGE_SIZE }),
    },
    {
      id: 'vote-score-trending-posts-after',
      run: () =>
        requireContinuation('Trending posts', () =>
          getTrendingPosts({ timeRange: 'week', limit: PAGE_SIZE, after: cursors.trending }),
        ),
    },
  ].map(scenario => ({
    ...scenario,
    contract: {
      expectations: [
        ...postScanGate(),
        ...(scenario.id.startsWith('vote-score-post-feed-hot-')
          ? [{ kind: 'custom' as const, name: 'postTopicMembership' }]
          : []),
        ...(scenario.id.startsWith('vote-score-post-feed-hot-')
          ? [
              'relation__post__category__topic',
              'relation__post__category__topic_alias',
              'topic_aliases',
            ].map(relation => ({
              kind: 'maxProcessedRows' as const,
              relation,
              // Follow and mute can each inspect the candidate post's topic children.
              max: WEEKLY_POST_SCAN_CAP * 2,
            }))
          : []),
      ],
      forbidSequentialScans: scenario.id.startsWith('vote-score-post-feed-hot-')
        ? [
            'relation__post__category__topic',
            'relation__post__category__topic_alias',
            'topic_aliases',
          ]
        : [],
      crossPartition: {
        posts: 'Hot ranking traverses eligible positive-score posts across the requested week.',
      },
    },
  }))
}
