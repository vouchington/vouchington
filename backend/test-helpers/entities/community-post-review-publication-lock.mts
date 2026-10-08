import { beginTransaction } from '@data-stores/psql'
import { runWithCapturedQueries } from '@data-stores/psql/query-capture'
import type { PrivateUser } from '@voucha/types/entities/user'
import { expect, onTestFinished } from 'vitest'
import { lockPostPublication } from '../../services/post-publication/lock.mts'
import { insertTestCommunity } from './communities.mts'
import { insertTestCommunityPostReview } from './community-post-reviews.mts'
import { insertTestPost } from './posts.mts'
import { createTestUser } from './users.mts'

const LOCK_ORDERING_MARKDOWN = 'Lock ordering regression fixture.'

type ReviewLockComment =
  | '/* agent moderation publication lock test */'
  | '/* manual moderation publication lock test */'

type PublicationLockScope = {
  owner: PrivateUser
  communityId: string
  postId: string
}

type UnpublishPublicationLockCase = {
  title: string
  slugPrefix: string
  reviewLockComment: ReviewLockComment
  afterCommunity?: (scope: { owner: PrivateUser; communityId: string }) => Promise<unknown>
  unpublish: (scope: PublicationLockScope) => Promise<unknown>
  assertUnpublished: (pending: Promise<unknown>) => Promise<unknown>
}

/**
 * Holds the community post review row, starts unpublish, and expects that call to
 * own the post publication lock before the review wait ends.
 */
export async function expectUnpublishHoldsPublicationLockWhileWaitingOnReview(
  input: UnpublishPublicationLockCase,
): Promise<void> {
  expect.hasAssertions()
  const owner = await createTestUser()
  const community = await insertTestCommunity({ createdById: owner.id })
  await input.afterCommunity?.({ owner, communityId: community.id })
  const postId = await insertTestPost({
    title: input.title,
    slug: `${input.slugPrefix}${crypto.randomUUID()}`,
    markdown: LOCK_ORDERING_MARKDOWN,
    createdById: owner.id,
  })
  await insertTestCommunityPostReview({ communityId: community.id, postId })

  const reviewLocked = Promise.withResolvers<void>()
  const releaseReview = Promise.withResolvers<void>()
  const publicationLocked = Promise.withResolvers<void>()
  // Observe early rejection even if the holder or unpublish fails before its matching lock call.
  void Promise.allSettled([reviewLocked.promise, publicationLocked.promise])
  let holder: Promise<void> | undefined
  let unpublishing: Promise<unknown> | undefined
  let cleanupPromise: Promise<void> | undefined
  const cleanup = () => {
    if (!cleanupPromise) {
      releaseReview.resolve()
      const stopped = new Error('Owned publication lock observer closed')
      reviewLocked.reject(stopped)
      publicationLocked.reject(stopped)
      cleanupPromise = Promise.allSettled([
        ...(holder ? [holder] : []),
        ...(unpublishing ? [unpublishing] : []),
      ]).then(() => undefined)
    }
    return cleanupPromise
  }
  onTestFinished(cleanup)

  const diagnostics = await runWithCapturedQueries(async context => {
    const unsubscribe = context.subscribe(event => {
      if (
        event.text ===
          '/* lockPostPublicationScope */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))' &&
        event.values.length === 1 &&
        event.values[0] === `post:${postId.toLowerCase()}`
      ) {
        if (event.status === 'fulfilled') publicationLocked.resolve()
        else publicationLocked.reject(event.reason)
      }
      return undefined
    })
    try {
      holder = holdCommunityPostReviewLock({
        comment: input.reviewLockComment,
        communityId: community.id,
        postId,
        onLocked: () => reviewLocked.resolve(),
        release: releaseReview.promise,
      })
      void holder.catch(reviewLocked.reject)
      await reviewLocked.promise
      unpublishing = input.unpublish({ owner, communityId: community.id, postId })
      void unpublishing.catch(publicationLocked.reject)
      await Promise.race([
        publicationLocked.promise,
        unpublishing.then(() => {
          throw new Error('Unpublish completed before acquiring its owned publication lock')
        }),
      ])
      await expect(lockPostPublicationWithTimeout(postId)).rejects.toMatchObject({ code: '55P03' })
      releaseReview.resolve()
      await holder
      await input.assertUnpublished(unpublishing)
    } finally {
      unsubscribe()
      await cleanup()
    }
  })
  await diagnostics.completionDrain
}

function reviewRowLockSql(comment: ReviewLockComment): string {
  switch (comment) {
    case '/* agent moderation publication lock test */':
    case '/* manual moderation publication lock test */':
      return `${comment}
      SELECT 1
      FROM community_post_reviews
      WHERE community_id = $1::uuid AND post_id = $2::uuid
      FOR UPDATE`
    default: {
      const unexpected: never = comment
      throw new Error(`Unexpected review lock comment: ${String(unexpected)}`)
    }
  }
}

async function holdCommunityPostReviewLock(input: {
  comment: ReviewLockComment
  communityId: string
  postId: string
  onLocked: () => void
  release: Promise<void>
}): Promise<void> {
  await using query = await beginTransaction()
  await query(reviewRowLockSql(input.comment), [input.communityId, input.postId])
  input.onLocked()
  await input.release
  await query.commit()
}

async function lockPostPublicationWithTimeout(postId: string): Promise<void> {
  await using query = await beginTransaction()
  await query(`SET LOCAL lock_timeout = '50ms'`)
  await lockPostPublication(query, postId)
  await query.commit()
}
