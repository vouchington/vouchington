/**
 * Test helper for creating trending posts data
 */

import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { createTestUserDirect } from './users.mts'
import { insertTestPost, deleteTestPost } from './posts.mts'
import { createRandomString } from '../data.mts'

export type CreateTrendingPostDataOptions = {
  votesScoreUp?: number
  postType?: 'discussion' | 'review' | 'data_point' | 'story' | 'topic_recommendation'
  createdAt?: Date
}

export type DominantPostFixtureSpec = Pick<
  CreateTrendingPostDataOptions,
  'votesScoreUp' | 'postType' | 'createdAt'
>

type OwnedTrendingPostDataOptions = DominantPostFixtureSpec & {
  postId: string
}

export async function createTrendingPostData(options: CreateTrendingPostDataOptions = {}) {
  return createTrendingPostDataWithOwnedId({
    ...options,
    postId: createTrendingPostId(options.createdAt),
  })
}

async function createTrendingPostDataWithOwnedId(options: OwnedTrendingPostDataOptions) {
  const { postId, votesScoreUp = 1, postType = 'discussion' } = options

  const user = await createTestUserDirect()
  if (!user) throw new Error('Failed to create test user')

  const random = createRandomString(10)

  await insertTestPost({
    id: postId,
    title: `Trending Post ${random}`,
    slug: `trending-post-${random}`,
    createdById: user.id,
    markdown: `Trending post content ${random}`,
    postType,
  })

  // Directly set vote counts — votes_score_net is GENERATED ALWAYS AS (votes_score_up - votes_score_down) STORED
  await write(sql`/* createTrendingPostData */
    UPDATE posts
    SET votes_score_up = ${votesScoreUp},
        votes_count_up = ${votesScoreUp}
    WHERE id = ${postId}
  `)

  return {
    postId,
    userId: user.id,
  }
}

/**
 * Run a callback against fixtures created via createTrendingPostData(), then always delete
 * every created post — including on a thrown assertion. The callback receives a frozen snapshot
 * of the IDs, never the helper's private cleanup ownership list.
 *
 * Use this specifically for **non-decaying dominant fixtures**: a future-dated `createdAt` (the
 * UUIDv7-derived id never ages out of a time-range cutoff) or a votes_score_up large enough to
 * outlast the hot-score decay window. Left uncleaned, such a fixture permanently tops every later
 * run's top-N trending query for every other test in the shared, dirty database — a plain
 * try/finally around the call site works too (see the far-future case in
 * get-trending-posts.test.mts), but wrapping in this helper makes cleanup-on-failure the default
 * instead of something each new test has to remember to add.
 *
 * Ordinary decaying fixtures (a normal createdAt + a score that decays back out of the top-N
 * within the test's time-range window) do not need this — see the README's "Surviving a Dirty
 * Database" high-score + minScore pattern.
 */
export async function withDominantPostFixtures<T>(
  specs: readonly DominantPostFixtureSpec[],
  run: (postIds: readonly string[]) => Promise<T>,
  options: {
    afterCreateForTest?: (
      fixture: Awaited<ReturnType<typeof createTrendingPostData>>,
      ownedSpec: Readonly<OwnedTrendingPostDataOptions>,
    ) => Promise<void>
  } = {},
): Promise<T> {
  const ownedPostIds: string[] = []
  let outcome: { ok: true; value: T } | { ok: false; error: unknown }

  try {
    for (const spec of specs) {
      const ownedSpec: OwnedTrendingPostDataOptions = {
        ...spec,
        postId: createTrendingPostId(spec.createdAt),
      }
      ownedPostIds.push(ownedSpec.postId)
      const fixture = await createTrendingPostDataWithOwnedId(ownedSpec)
      await options.afterCreateForTest?.(fixture, ownedSpec)
    }
    const callbackPostIds = Object.freeze([...ownedPostIds])
    outcome = { ok: true, value: await run(callbackPostIds) }
  } catch (error) {
    outcome = { ok: false, error }
  }

  const cleanupResults = await Promise.allSettled(
    [...new Set(ownedPostIds)].map(postId => deleteTestPost(postId)),
  )
  const cleanupErrors = cleanupResults.reduce<unknown[]>((errors, result) => {
    if (result.status === 'rejected') errors.push(result.reason)
    return errors
  }, [])
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      outcome.ok ? cleanupErrors : [outcome.error, ...cleanupErrors],
      'Failed to clean up dominant post fixtures',
    )
  }

  if (!outcome.ok) throw outcome.error
  return outcome.value
}

function createTrendingPostId(createdAt?: Date): string {
  return createdAt ? uuidv7({ msecs: createdAt.getTime() }) : uuidv7()
}
