import { beforeEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestPost,
  createTestUserWithAge,
  flushPendingTasks,
  insertPostElectionVote,
  readAllQueueJobs,
  waitForQueueJobs,
} from '@voucha/test-helpers'
import { activitypubDelivery } from '@queues/activitypub-delivery/queues'
import type { DistributeActivityData } from '@queues/activitypub-delivery/enqueues'
import type { PrivateUser } from '@services/users/types'
import { upsertPostElectionVotes } from '@services/elections-votes/post'

describe('post vote ActivityPub identities', () => {
  let voter: PrivateUser

  beforeEach(async () => {
    await activitypubDelivery.obliterate({ force: true })
    voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  it('rotates the Like identity when re-liking after an UndoLike', async () => {
    const post = await createTestPost({ user: voter })
    const request = createRequest()
    await request.authenticateAs(voter)

    await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'like' }).expect(204)
    let jobs = await waitForLikeCount(post.id, 1)
    const firstLikeId = getLikeIds(jobs, post.id)[0]

    await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'neutral' }).expect(204)
    await waitForUndoLike(post.id)
    await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'like' }).expect(204)
    jobs = await waitForLikeCount(post.id, 2)

    const likeIds = getLikeIds(jobs, post.id)
    expect(likeIds).toHaveLength(2)
    expect(new Set(likeIds).size).toBe(2)
    expect(likeIds[1]).not.toBe(firstLikeId)
  })

  it('emits one Like generation for concurrent non-Like to Like requests', async () => {
    const post = await createTestPost({ user: voter })
    const request = createRequest()
    await request.authenticateAs(voter)
    await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'dislike' }).expect(204)
    await activitypubDelivery.obliterate({ force: true })

    await Promise.all([
      request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'like' }).expect(204),
      request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'like' }).expect(204),
    ])

    await waitForLikeCount(post.id, 1)
    await flushPendingTasks()
    const jobs = await readAllQueueJobs(activitypubDelivery)
    expect(getLikeIds(jobs, post.id)).toHaveLength(1)
  })

  it('preserves an unknown legacy Like identity and quietly skips its Undo', async () => {
    const post = await createTestPost({ user: voter })
    await insertPostElectionVote(voter.id, post.id, 1, undefined, false, true)
    await activitypubDelivery.obliterate({ force: true })

    const [repeatedLike] = await upsertPostElectionVotes(voter.id, [
      { entityId: post.id, score: 1 },
    ])
    expect(repeatedLike).toBeUndefined()

    const request = createRequest()
    await request.authenticateAs(voter)
    await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'neutral' }).expect(204)
    await flushPendingTasks()

    expect(await readAllQueueJobs(activitypubDelivery)).toEqual([])
  })
})

function getLikeIds(
  jobs: Awaited<ReturnType<typeof activitypubDelivery.getJobs>>,
  postId: string,
): string[] {
  return jobs
    .map(job => job.data as DistributeActivityData)
    .filter(
      (data): data is Extract<DistributeActivityData, { activityType: 'Like' }> =>
        data.activityType === 'Like' && data.targetPostId === postId,
    )
    .map(data => data.activityId)
}

async function waitForLikeCount(
  postId: string,
  expectedCount: number,
): Promise<Awaited<ReturnType<typeof activitypubDelivery.getJobs>>> {
  return waitForQueueJobs(
    activitypubDelivery,
    jobs => getLikeIds(jobs, postId).length === expectedCount,
  )
}

async function waitForUndoLike(postId: string): Promise<void> {
  await waitForQueueJobs(activitypubDelivery, jobs =>
    jobs.some(job => {
      const data = job.data as DistributeActivityData
      return data.activityType === 'UndoLike' && data.targetPostId === postId
    }),
  )
}
