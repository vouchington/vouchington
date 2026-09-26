import { randomBytes } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createTestUserDirect,
  insertPostElectionVote,
  insertTestPost,
  insertUserVouchElectionVote,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { enqueueBulkUpdatePostElectionVoteStats } from '@queues/elections/enqueues'
import { elections } from '@queues/elections/queues'
import {
  enqueueElectionUpdatesForUser,
  getBulkEnqueuedJobIds,
} from './enqueue-election-updates.mts'

const randomHex = () => randomBytes(4).toString('hex')
const randomUsername = () => `test-vw-enqueue-${randomHex()}`

describe('enqueueElectionUpdatesForUser', () => {
  it('extracts persisted bulk job ids and rejects unexpected enqueue result shapes', () => {
    expect(getBulkEnqueuedJobIds([])).toEqual([])
    expect(getBulkEnqueuedJobIds([{ id: 'job-1' }, { id: 'job-2' }])).toEqual(['job-1', 'job-2'])
    expect(() => getBulkEnqueuedJobIds(undefined)).toThrow('Expected election bulk enqueue')
    expect(() => getBulkEnqueuedJobIds({ id: 'job-1' })).toThrow('Expected election bulk enqueue')
    expect(() => getBulkEnqueuedJobIds([null])).toThrow(
      'Expected election bulk enqueue to return jobs with string ids',
    )
    expect(() => getBulkEnqueuedJobIds([1])).toThrow(
      'Expected election bulk enqueue to return jobs with string ids',
    )
    expect(() => getBulkEnqueuedJobIds([{ id: 1 }])).toThrow(
      'Expected election bulk enqueue to return jobs with string ids',
    )
  })

  it('does not enqueue election update jobs for a user with no votes', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const unrelatedPostId = await insertTestPost({
      title: `Unrelated vote weight enqueue test ${randomHex()}`,
      slug: `vw-unrelated-${randomHex()}`,
      createdById: user!.id,
      markdown: 'unrelated election job',
    })

    const [submittedJobIds, unrelatedJobs] = await Promise.all([
      enqueueElectionUpdatesForUser(user!.id),
      enqueueBulkUpdatePostElectionVoteStats([unrelatedPostId]),
    ])
    expect(submittedJobIds).toEqual([])

    const [unrelatedJobId] = getBulkEnqueuedJobIds(unrelatedJobs)
    if (!unrelatedJobId) throw new Error('Unrelated election enqueue did not persist a job')
    const unrelatedJob = await elections.getJob(unrelatedJobId)
    expect(unrelatedJob?.data.electionId).toBe(unrelatedPostId)
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

    const submittedJobIds = await enqueueElectionUpdatesForUser(user!.id)

    let jobs: Awaited<ReturnType<typeof getElectionJobs>> = []
    await vi.waitFor(async () => {
      jobs = await getElectionJobs(postId)
      expect(jobs).toHaveLength(1)
    })
    expect(submittedJobIds).toEqual([jobs[0].id])
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

    const submittedJobIds = await enqueueElectionUpdatesForUser(voter!.id)

    let jobs: Awaited<ReturnType<typeof getElectionJobs>> = []
    await vi.waitFor(async () => {
      jobs = await getElectionJobs(target!.id)
      expect(jobs).toHaveLength(1)
    })
    expect(submittedJobIds).toEqual([jobs[0].id])
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
    const unrelatedUser = await createTestUserDirect({ username: randomUsername() })
    const unrelatedPostId = await insertTestPost({
      title: `Unrelated vote weight enqueue test ${randomHex()}`,
      slug: `vw-unrelated-${randomHex()}`,
      createdById: unrelatedUser!.id,
      markdown: 'unrelated election job',
    })

    const [submittedJobIds, unrelatedJobs] = await Promise.all([
      enqueueElectionUpdatesForUser(fakeId),
      enqueueBulkUpdatePostElectionVoteStats([unrelatedPostId]),
    ])
    expect(submittedJobIds).toEqual([])

    const [unrelatedJobId] = getBulkEnqueuedJobIds(unrelatedJobs)
    if (!unrelatedJobId) throw new Error('Unrelated election enqueue did not persist a job')
    const unrelatedJob = await elections.getJob(unrelatedJobId)
    expect(unrelatedJob?.data.electionId).toBe(unrelatedPostId)
  }, 60_000)
})

async function getElectionJobs(electionId: string) {
  const jobs = await readAllQueueJobs(elections)
  return jobs.filter(job => (job.data as { electionId?: string }).electionId === electionId)
}
