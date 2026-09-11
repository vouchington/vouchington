import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestUserDirect,
  insertPostElectionVote,
  insertTestPost,
  insertUserVouchElectionVote,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { elections } from '@queues/elections/queues'
import { enqueueElectionUpdatesForUser } from './enqueue-election-updates.mts'

const randomHex = () => randomBytes(4).toString('hex')
const randomUsername = () => `test-vw-enqueue-${randomHex()}`

describe('enqueueElectionUpdatesForUser', () => {
  it('does not enqueue election update jobs for a user with no votes', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })

    const before = new Set((await readAllQueueJobs(elections)).map(job => job.id))
    await enqueueElectionUpdatesForUser(user!.id)
    const added = (await readAllQueueJobs(elections)).filter(job => !before.has(job.id))
    expect(added).toEqual([])
  }, 60_000)

  it('enqueues a post election update for the voted post id', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const postId = await insertTestPost({
      title: `Vote weight enqueue test ${randomHex()}`,
      slug: `vw-enqueue-${randomHex()}`,
      createdById: user!.id,
      markdown: 'test post for vote weight enqueue',
    })
    await insertPostElectionVote(user!.id, postId, 1)

    await enqueueElectionUpdatesForUser(user!.id)

    let jobs: Awaited<ReturnType<typeof getElectionJobs>> = []
    await vi.waitFor(async () => {
      jobs = await getElectionJobs(postId)
      expect(jobs).toHaveLength(1)
    })
    expect(jobs[0].name).toBe('processUpdateElectionVoteStats')
    expect(jobs[0].opts).toMatchObject({
      priority: 10,
      deduplication: {
        id: `processUpdateElectionVoteStats__post__${postId}`,
        mode: 'throttle',
      },
      ordering: {
        key: 'post',
        concurrency: 100,
      },
    })
  }, 60_000)

  it('enqueues a user-vouch election update for the voted user id', async () => {
    const voter = await createTestUserDirect({ username: randomUsername() })
    const target = await createTestUserDirect({ username: randomUsername() })
    await insertUserVouchElectionVote(voter!.id, target!.id, 1)

    await enqueueElectionUpdatesForUser(voter!.id)

    let jobs: Awaited<ReturnType<typeof getElectionJobs>> = []
    await vi.waitFor(async () => {
      jobs = await getElectionJobs(target!.id)
      expect(jobs).toHaveLength(1)
    })
    expect(jobs[0].opts).toMatchObject({
      deduplication: {
        id: `processUpdateElectionVoteStats__user_vouch__${target!.id}`,
        mode: 'throttle',
      },
      ordering: {
        key: 'user_vouch',
        concurrency: 100,
      },
    })
  }, 60_000)

  it('resolves for a non-existent user without enqueueing a matching job', async () => {
    const fakeId = '00000000-0000-7000-8000-000000000001'

    const before = new Set((await readAllQueueJobs(elections)).map(job => job.id))
    await enqueueElectionUpdatesForUser(fakeId)
    const added = (await readAllQueueJobs(elections)).filter(job => !before.has(job.id))
    expect(added).toEqual([])
  }, 60_000)
})

async function getElectionJobs(electionId: string) {
  const jobs = await readAllQueueJobs(elections)
  return jobs.filter(job => (job.data as { electionId?: string }).electionId === electionId)
}
