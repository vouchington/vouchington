import { beforeEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestPost,
  createTestUserWithAge,
  CONTRIBUTING_USER_AGE_MS,
  flushPendingTasks,
  insertTestPost,
  readAllQueueJobs,
  waitForQueueJobs,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { activitypubDelivery } from '@queues/activitypub-delivery/queues'
import type { DistributeActivityData } from '@queues/activitypub-delivery/enqueues'

const randomSuffix = () => Math.random().toString(36).slice(2, 10)

describe('post.vote', () => {
  describe('Post Vote Routes', () => {
    // Phase C4: PUT /vote's onVote hook fans a Like/Undo(Like) out to the voter's remote followers.
    describe('outbound federation (Phase C4 onVote hook)', () => {
      // Use a dedicated voter per test (not a file-level shared user) so rate-limit and daily
      // contribution-quota keys are unique per test run — this block issues multiple votes per
      // test across many tests, which would otherwise pile onto the shared user's 24h quota bucket
      // (see backend/services/contribution-gating/quota.mts) and trip a 429 unrelated to what's
      // under test here.
      let voter: PrivateUser

      beforeEach(async () => {
        await activitypubDelivery.obliterate({ force: true })
        voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
      })

      async function waitForDistributeActivityJobs(
        predicate: (jobs: Awaited<ReturnType<typeof activitypubDelivery.getJobs>>) => boolean,
        timeoutMs = 1000,
      ): Promise<Awaited<ReturnType<typeof activitypubDelivery.getJobs>>> {
        return waitForQueueJobs(activitypubDelivery, predicate, timeoutMs)
      }

      function hasDistributeJobFor(
        jobs: Awaited<ReturnType<typeof activitypubDelivery.getJobs>>,
        targetPostId: string,
        activityType: 'Like' | 'UndoLike',
      ): boolean {
        return jobs.some(
          job =>
            job.name === 'distributeActivity' &&
            (job.data as DistributeActivityData).activityType === activityType &&
            (job.data as Extract<DistributeActivityData, { activityType: 'Like' | 'UndoLike' }>)
              .targetPostId === targetPostId,
        )
      }

      function countDistributeJobsFor(
        jobs: Awaited<ReturnType<typeof activitypubDelivery.getJobs>>,
        targetPostId: string,
        activityType: 'Like' | 'UndoLike',
      ): number {
        return jobs.filter(
          job =>
            job.name === 'distributeActivity' &&
            (job.data as DistributeActivityData).activityType === activityType &&
            (job.data as Extract<DistributeActivityData, { activityType: 'Like' | 'UndoLike' }>)
              .targetPostId === targetPostId,
        ).length
      }

      function getDistributeJobFor(
        jobs: Awaited<ReturnType<typeof activitypubDelivery.getJobs>>,
        targetPostId: string,
        activityType: 'Like' | 'UndoLike',
      ): Extract<DistributeActivityData, { activityType: 'Like' | 'UndoLike' }> | undefined {
        return jobs
          .filter(job => job.name === 'distributeActivity')
          .map(
            job =>
              job.data as Extract<DistributeActivityData, { activityType: 'Like' | 'UndoLike' }>,
          )
          .find(data => data.activityType === activityType && data.targetPostId === targetPostId)
      }

      // A wrongful fire-and-forget second enqueue may land after the PUT response.
      // Give any in-flight enqueue a grace period before asserting absence.
      it('enqueues a Like distribution when voting score is 1', async () => {
        const post = await createTestPost({ user: voter })

        const request = createRequest()
        await request.authenticateAs(voter)

        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'like' }).expect(204)

        const jobs = await waitForDistributeActivityJobs(j =>
          hasDistributeJobFor(j, post.id, 'Like'),
        )
        expect(hasDistributeJobFor(jobs, post.id, 'Like')).toBe(true)
        expect(getDistributeJobFor(jobs, post.id, 'Like')?.activityId).toBeTruthy()
      })

      // previousScore is null on a fresh vote (no prior row) — a vote of 0 or -1 with no prior
      // Like is not a Like -> non-Like transition (the voter was never in a Like state), so it
      // must not fan out a bogus UndoLike. Guards against the `previousScore === score` naive
      // equality check, which wrongly treated null->0 and null->-1 as "was liked, now unliked".
      it('does not enqueue any distribution for a Neutral retract of a never-liked ballot', async () => {
        const post = await createTestPost({ user: voter })

        const request = createRequest()
        await request.authenticateAs(voter)

        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'dislike' }).expect(204)
        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'neutral' }).expect(204)
        await flushPendingTasks()

        const jobs = await readAllQueueJobs(activitypubDelivery)
        expect(countDistributeJobsFor(jobs, post.id, 'Like')).toBe(0)
        expect(countDistributeJobsFor(jobs, post.id, 'UndoLike')).toBe(0)
      })

      it('does not enqueue any distribution for a fresh vote of score -1 (never liked)', async () => {
        const post = await createTestPost({ user: voter })

        const request = createRequest()
        await request.authenticateAs(voter)

        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'dislike' }).expect(204)
        await flushPendingTasks()

        const jobs = await readAllQueueJobs(activitypubDelivery)
        expect(countDistributeJobsFor(jobs, post.id, 'Like')).toBe(0)
        expect(countDistributeJobsFor(jobs, post.id, 'UndoLike')).toBe(0)
      })

      it('does not enqueue a distribution when transitioning between non-Like scores (0 -> -1)', async () => {
        const post = await createTestPost({ user: voter })

        const request = createRequest()
        await request.authenticateAs(voter)

        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'dislike' }).expect(204)
        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'neutral' }).expect(204)
        await flushPendingTasks()

        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'dislike' }).expect(204)
        await flushPendingTasks()

        const jobs = await readAllQueueJobs(activitypubDelivery)
        expect(countDistributeJobsFor(jobs, post.id, 'Like')).toBe(0)
        expect(countDistributeJobsFor(jobs, post.id, 'UndoLike')).toBe(0)
      })

      it('does not enqueue a duplicate distribution on an idempotent same-score revote', async () => {
        const post = await createTestPost({ user: voter })

        const request = createRequest()
        await request.authenticateAs(voter)

        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'like' }).expect(204)
        await waitForDistributeActivityJobs(j => hasDistributeJobFor(j, post.id, 'Like'))

        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'like' }).expect(204)
        await flushPendingTasks()

        const jobs = await readAllQueueJobs(activitypubDelivery)
        expect(countDistributeJobsFor(jobs, post.id, 'Like')).toBe(1)
        const like = getDistributeJobFor(jobs, post.id, 'Like')
        expect(like?.activityId).toBeTruthy()
      })

      it('enqueues a fresh UndoLike distribution on a genuine score transition', async () => {
        const post = await createTestPost({ user: voter })

        const request = createRequest()
        await request.authenticateAs(voter)

        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'like' }).expect(204)
        await waitForDistributeActivityJobs(j => hasDistributeJobFor(j, post.id, 'Like'))

        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'neutral' }).expect(204)

        const jobs = await waitForDistributeActivityJobs(j =>
          hasDistributeJobFor(j, post.id, 'UndoLike'),
        )
        expect(hasDistributeJobFor(jobs, post.id, 'UndoLike')).toBe(true)
        const like = getDistributeJobFor(jobs, post.id, 'Like')
        const undo = getDistributeJobFor(jobs, post.id, 'UndoLike')
        if (undo?.activityType !== 'UndoLike') throw new Error('Missing UndoLike job')
        expect(undo.originalActivityId).toBe(like?.activityId)
        expect(undo.activityId).not.toBe(undo.originalActivityId)
      })

      it('enqueues an UndoLike distribution when transitioning directly from Like to Dislike', async () => {
        const post = await createTestPost({ user: voter })

        const request = createRequest()
        await request.authenticateAs(voter)

        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'like' }).expect(204)
        await waitForDistributeActivityJobs(j => hasDistributeJobFor(j, post.id, 'Like'))

        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'dislike' }).expect(204)

        const jobs = await waitForDistributeActivityJobs(j =>
          hasDistributeJobFor(j, post.id, 'UndoLike'),
        )
        expect(hasDistributeJobFor(jobs, post.id, 'UndoLike')).toBe(true)
      })

      // Fix (P1): a vote is only federated when the post is genuinely public — voting on a
      // private post must not leak its AP URI/vote state to the voter's remote followers, even
      // though the voter (as the post's own creator) can view and vote on it.
      it('does not enqueue a distribution for a Like on a non-public post', async () => {
        const post = await createTestPost({ user: voter, privacy: 'private', broadcast: 'users' })

        const request = createRequest()
        await request.authenticateAs(voter)

        await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'like' }).expect(204)
        await flushPendingTasks()

        const jobs = await readAllQueueJobs(activitypubDelivery)
        expect(countDistributeJobsFor(jobs, post.id, 'Like')).toBe(0)
      })

      // Fix (P2, Codex re-review): getEntity swaps a comment for its ROOT post via
      // getRouteAccessPost, so the `entity` seen inside onVote is the root, not the comment
      // actually being voted on and federated. A comment still pending moderation (and so
      // invisible to anonymous viewers) must not be federated just because its root happens to
      // already be public.
      it('does not enqueue a distribution for a Like on a pending comment whose root is public', async () => {
        const rootId = await insertTestPost({
          title: 'Federation Root',
          slug: `federation-root-${randomSuffix()}`,
          createdById: voter.id,
          markdown: 'Root content',
        })
        const commentId = await insertTestPost({
          title: '',
          slug: `federation-pending-comment-${randomSuffix()}`,
          createdById: voter.id,
          markdown: 'Pending comment content',
          postType: 'comment',
          rootId,
          parentId: rootId,
          clearanceStatus: 'pending',
        })

        const request = createRequest()
        await request.authenticateAs(voter)

        await request.put(`/api/v1/posts/${commentId}/vote`).send({ choice: 'like' }).expect(204)
        await flushPendingTasks()

        const jobs = await readAllQueueJobs(activitypubDelivery)
        expect(countDistributeJobsFor(jobs, commentId, 'Like')).toBe(0)
      })

      // Fix (P2, round-6 re-review): comments are unconditionally created with
      // privacy='public'/broadcast='everyone' (getAudienceDefaults) regardless of their root's
      // actual settings, so canViewPost on the comment row alone always passes and never sees a
      // restricted root. An approved (non-pending) comment under a private, broadcast='users' root
      // must still not federate — otherwise the private discussion's existence and vote state leaks
      // to the voter's remote followers via the comment's own AP URI.
      it('does not enqueue a distribution for a Like on an approved comment whose root is private', async () => {
        const rootId = await insertTestPost({
          title: 'Federation Private Root',
          slug: `federation-private-root-${randomSuffix()}`,
          createdById: voter.id,
          markdown: 'Root content',
          privacy: 'private',
          broadcast: 'users',
        })
        const commentId = await insertTestPost({
          title: '',
          slug: `federation-comment-under-private-root-${randomSuffix()}`,
          createdById: voter.id,
          markdown: 'Comment content',
          postType: 'comment',
          rootId,
          parentId: rootId,
        })

        const request = createRequest()
        await request.authenticateAs(voter)

        await request.put(`/api/v1/posts/${commentId}/vote`).send({ choice: 'like' }).expect(204)
        await flushPendingTasks()

        const jobs = await readAllQueueJobs(activitypubDelivery)
        expect(countDistributeJobsFor(jobs, commentId, 'Like')).toBe(0)
      })
    })
  })
})
