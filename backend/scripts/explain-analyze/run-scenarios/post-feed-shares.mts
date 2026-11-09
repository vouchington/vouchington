import type { PrivateUser } from '@services/users/types'
import type { PostFeedOptions } from '@services/feeds/types'
import { getPostFeedIds } from '@services/feeds'
import { heavyFollowUser, runAndCapture } from '../run-support.mts'
import {
  POST_SHARE_DENSE_DELIVERIES_PER_TARGET,
  POST_SHARE_DENSE_TARGET_COUNT,
} from '../seed-data/post-feed-shares.mts'
import { registerScenarioContract, type PlanExpectation } from '../plan-expectations.mts'
import { runPostFeedInspectedCursorScenarios } from './post-feed-inspected-cursor.mts'

const PAGE = 25
/** The heavy follower follows 1000 users who each wrote a recent post. */
const HEAVY_FOLLOW_POSTS = 1000
const HEAVY_FOLLOW_SHARES = POST_SHARE_DENSE_TARGET_COUNT * POST_SHARE_DENSE_DELIVERIES_PER_TARGET
// Each delivery reads its post and its root post.
const PROBES_PER_DELIVERY = 2
/** A keyset walk reads the page plus one row per arm; each row probes its post and root post. */
const WALK_ROWS = (PAGE + 1) * PROBES_PER_DELIVERY * 3

/** Seeded posts are one minute apart, so a one-week window holds this many. */
const WINDOW_POSTS = 7 * 24 * 60

/**
 * best stops after `limit + 1` rows per arm. new stops early under a custom plan, but a generic
 * plan may range-scan the window, so its bound is the window plus one probe per followed post.
 * hot ranks by a computed score, so its bound is the 30-day window: every positive-score followed
 * post and every share the viewer holds.
 */
const bounds: Record<'new' | 'hot' | 'best', { posts: number; shares: number }> = {
  new: {
    posts: WINDOW_POSTS + HEAVY_FOLLOW_POSTS + (PAGE + 1) * PROBES_PER_DELIVERY,
    shares: (PAGE + 1) * 2,
  },
  hot: {
    posts: PROBES_PER_DELIVERY * (HEAVY_FOLLOW_POSTS + HEAVY_FOLLOW_SHARES),
    shares: Math.ceil(HEAVY_FOLLOW_SHARES * 1.25),
  },
  best: { posts: WALK_ROWS, shares: (PAGE + 1) * 2 },
}

const walkOptions: Record<'new' | 'hot' | 'best', PostFeedOptions> = {
  new: { feed_type: 'follow_users', sort: 'new', time_range: '1w', limit: PAGE },
  hot: { feed_type: 'follow_users', sort: 'hot', time_range: '1w', limit: PAGE },
  // hot with a year or longer window is the best-scored walk over `votes_score_sort`.
  best: { feed_type: 'follow_users', sort: 'hot', time_range: 'all', limit: PAGE },
}

function expectationsFor(sort: keyof typeof bounds): PlanExpectation[] {
  return [
    { kind: 'maxProcessedRows', relation: 'posts', max: bounds[sort].posts },
    { kind: 'maxProcessedRows', relation: 'post_feed_shares', max: bounds[sort].shares },
  ]
}

export async function runPostFeedShareScenarios(): Promise<void> {
  for (const sort of ['new', 'hot', 'best'] as const) {
    const scenarioId = `post-feed-walk-${sort}`
    const options = walkOptions[sort]
    const user = heavyFollowUser as PrivateUser
    registerScenarioContract(scenarioId, {
      expectations: expectationsFor(sort),
      crossPartition: { posts: 'The feed walks direct and shared posts across id ranges.' },
    })
    let after: string | undefined
    let firstPageIds: string[] = []
    await runAndCapture(scenarioId, async () => {
      const page = await getPostFeedIds(user, options)
      if (!page.page_info.has_next_page || !page.page_info.end_cursor)
        throw new Error(`${scenarioId} must return an inspected-key continuation`)
      after = page.page_info.end_cursor ?? undefined
      firstPageIds = page.results.map(result => result.id)
    })
    if (!after) throw new Error(`${scenarioId} must have a continuation cursor`)
    registerScenarioContract(`${scenarioId}-after`, {
      expectations: expectationsFor(sort),
      crossPartition: { posts: 'The feed walks direct and shared posts across id ranges.' },
    })
    await runAndCapture(`${scenarioId}-after`, async () => {
      const next = await getPostFeedIds(user, { ...options, after })
      if (!next.page_info.has_next_page || !next.page_info.end_cursor)
        throw new Error(`${scenarioId} continuation must preserve inspected-key progress`)
      if (next.page_info.end_cursor === after)
        throw new Error(`${scenarioId} continuation did not advance its cursor`)
      const firstIds = new Set(firstPageIds)
      if (next.results.some(result => firstIds.has(result.id)))
        throw new Error(`${scenarioId} continuation repeated a delivery from its first page`)
    })
  }
  await runPostFeedInspectedCursorScenarios()
}
