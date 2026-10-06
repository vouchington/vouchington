import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestPost,
  createTestUserWithAge,
  insertPostElectionVote,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { activitypubDelivery } from '@queues/activitypub-delivery/queues'
import type { DistributeActivityData } from '@queues/activitypub-delivery/enqueues'
import type { PrivateUser } from '@services/users/types'
import { upsertPostElectionVotes } from '@services/elections-votes/post'

describe('post vote ActivityPub identities', () => {
  let voter: PrivateUser
  let settleDelivery = () => Promise.resolve()

  beforeEach(async () => {
    await activitypubDelivery.obliterate({ force: true })
    const pending: Promise<unknown>[] = []
    const add = activitypubDelivery.add
    vi.spyOn(activitypubDelivery, 'add').mockImplementation((...args: Parameters<typeof add>) => {
      const job = add.call(activitypubDelivery, ...args)
      pending.push(job)
      return job
    })
    settleDelivery = () => Promise.all(pending).then(() => undefined)
    voter = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  afterEach(() => {
    vi.mocked(activitypubDelivery.add).mockRestore()
  })

  it('rotates the Like identity when re-liking after an UndoLike', async () => {
    const post = await createTestPost({ user: voter })
    const request = createRequest()
    await request.authenticateAs(voter)

    await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'like' }).expect(204)
    let jobs = await settledDeliveryJobs(settleDelivery)
    const firstLikeId = getLikeIds(jobs, post.id)[0]

    await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'neutral' }).expect(204)
    jobs = await settledDeliveryJobs(settleDelivery)
    expect(
      jobs.some(job => {
        const data = job.data as DistributeActivityData
        return data.activityType === 'UndoLike' && data.targetPostId === post.id
      }),
    ).toBe(true)
    await request.put(`/api/v1/posts/${post.id}/vote`).send({ choice: 'like' }).expect(204)
    jobs = await settledDeliveryJobs(settleDelivery)

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

    const jobs = await settledDeliveryJobs(settleDelivery)
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

    expect(await settledDeliveryJobs(settleDelivery)).toEqual([])
  })
})

async function settledDeliveryJobs(settle: () => Promise<void>) {
  await settle()
  return readAllQueueJobs(activitypubDelivery)
}

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
