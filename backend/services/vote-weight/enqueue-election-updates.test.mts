import { onEnqueueAdmission } from '@data-stores/valkey-glide-mq/glide-mq-admission'
import type { Job } from 'glide-mq'
import { getSharedBackgroundWorker } from '../../../test-helpers/shared-background-worker.mts'
import { randomBytes, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  insertPostElectionVote,
  insertTestPost,
  insertUserVouchElectionVote,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { enqueueBulkUpdatePostElectionVoteStats } from '@queues/vote-aggregation/enqueues/elections'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import {
  enqueueElectionUpdatePageForUser,
  enqueueElectionUpdatesForUser,
  getBulkEnqueuedJobIds,
  type ElectionUpdatePage,
} from './enqueue-election-updates.mts'
import { pagedDispatchConfig } from '@data-stores/valkey-glide-mq/paged-dispatcher-config'

const ELECTION_JOB_NAME = 'vote-aggregation.processUpdateElectionVoteStats'
const randomHex = () => randomBytes(4).toString('hex')
const randomUsername = () => `test-vw-enqueue-${randomHex()}`

async function createPost(createdById: string): Promise<string> {
  return insertTestPost({
    title: `Vote weight enqueue test ${randomHex()}`,
    slug: `vw-enqueue-${randomHex()}`,
    createdById,
    markdown: 'test post for vote weight enqueue',
  })
}

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

  it('enqueues the whole short history in one page without a continuation', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const postId = await createPost(user!.id)
    await insertPostElectionVote(user!.id, postId, 1)

    const admitted: string[] = []
    const off = onEnqueueAdmission(event => {
      if (event.jobName === ELECTION_JOB_NAME)
        for (const input of event.inputs) {
          const id = (input as { electionId?: string }).electionId
          if (id === postId) admitted.push(id)
        }
    })
    try {
      await expect(enqueueElectionUpdatesForUser(user!.id)).resolves.toBeUndefined()
      expect(admitted).toEqual([postId])
    } finally {
      off()
    }
  })

  it('continues a longer history through a fan-out job from the last row of the page', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const postIds = await Promise.all([1, 2, 3].map(() => createPost(user!.id)))
    for (const postId of postIds) await insertPostElectionVote(user!.id, postId, 1)

    const admitted: string[] = []
    const off = onEnqueueAdmission(event => {
      if (event.jobName === ELECTION_JOB_NAME)
        for (const input of event.inputs) {
          const id = (input as { electionId?: string }).electionId
          if (id && postIds.includes(id)) admitted.push(id)
        }
    })
    const restore = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
      elections_page_size: 2,
    })
    try {
      const completed = Promise.withResolvers<void>()
      const worker = getSharedBackgroundWorker()
      const onCompleted = (job: Job) => {
        if (
          job.name === 'vote-aggregation.enqueueUserElectionUpdates' &&
          job.data.userId === user!.id &&
          (job.returnvalue as ElectionUpdatePage | undefined)?.nextCursor === null
        )
          completed.resolve()
      }
      worker.on('completed', onCompleted)
      try {
        await expect(enqueueElectionUpdatesForUser(user!.id)).resolves.toBeUndefined()
        await completed.promise
      } finally {
        worker.off('completed', onCompleted)
      }
    } finally {
      restore()
      off()
    }

    expect(admitted.toSorted()).toEqual(postIds.toSorted())
  })
})

describe('enqueueElectionUpdatePageForUser', () => {
  it('does not enqueue election update jobs for a user with no votes', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const unrelatedPostId = await createPost(user!.id)

    const [page, unrelatedJobs] = await Promise.all([
      enqueueElectionUpdatePageForUser(user!.id, null),
      enqueueBulkUpdatePostElectionVoteStats([unrelatedPostId]),
    ])
    expect(page).toEqual({ jobIds: [], nextCursor: null })

    const [unrelatedJobId] = getBulkEnqueuedJobIds(unrelatedJobs)
    if (!unrelatedJobId) throw new Error('Unrelated election enqueue did not persist a job')
    const unrelatedJob = await voteAggregation.getJob(unrelatedJobId)
    expect(unrelatedJob?.data).toMatchObject({ electionId: unrelatedPostId })
  })

  it('enqueues a post election update for the voted post id', async () => {
    const user = await createTestUserDirect({ username: randomUsername() })
    const postId = await createPost(user!.id)
    await insertPostElectionVote(user!.id, postId, 1)

    const { jobIds, nextCursor } = await enqueueElectionUpdatePageForUser(user!.id, null)

    expect(nextCursor).toBeNull()
    expect(jobIds).toHaveLength(1)
    const submittedJobId = jobIds[0]
    if (submittedJobId === undefined) throw new Error('Expected one post election job id')
    const job = await voteAggregation.getJob(submittedJobId)
    expect(job?.id).toBe(submittedJobId)
    expect(job?.name).toBe(ELECTION_JOB_NAME)
    expect(job?.opts).toMatchObject({
      priority: 10,
      deduplication: {
        id: `processUpdateElectionVoteStats__post__${postId}`,
        mode: 'throttle',
      },
      ordering: { key: 'vote-aggregation', concurrency: 10 },
    })
  })

  it('enqueues a user-vouch election update for the voted user id', async () => {
    const voter = await createTestUserDirect({ username: randomUsername() })
    const target = await createTestUserDirect({ username: randomUsername() })
    await insertUserVouchElectionVote(voter!.id, target!.id, 1)

    const { jobIds } = await enqueueElectionUpdatePageForUser(voter!.id, null)

    expect(jobIds).toHaveLength(1)
    const submittedJobId = jobIds[0]
    if (submittedJobId === undefined) throw new Error('Expected one user vouch election job id')
    const job = await voteAggregation.getJob(submittedJobId)
    expect(job?.id).toBe(submittedJobId)
    expect(job?.opts).toMatchObject({
      deduplication: {
        id: `processUpdateElectionVoteStats__user_vouch__${target!.id}`,
        mode: 'throttle',
      },
      ordering: { key: 'vote-aggregation', concurrency: 10 },
    })
  })

  it('resolves for a non-existent user without enqueueing a matching job', async () => {
    const fakeId = randomUUID()
    const unrelatedUser = await createTestUserDirect({ username: randomUsername() })
    const unrelatedPostId = await createPost(unrelatedUser!.id)

    const [page, unrelatedJobs] = await Promise.all([
      enqueueElectionUpdatePageForUser(fakeId, null),
      enqueueBulkUpdatePostElectionVoteStats([unrelatedPostId]),
    ])
    expect(page.jobIds).toEqual([])

    const [unrelatedJobId] = getBulkEnqueuedJobIds(unrelatedJobs)
    if (!unrelatedJobId) throw new Error('Unrelated election enqueue did not persist a job')
    const unrelatedJob = await voteAggregation.getJob(unrelatedJobId)
    expect(unrelatedJob?.data).toMatchObject({ electionId: unrelatedPostId })
  })

  it('pages across vote tables: no page exceeds the size and every vote is covered once', async () => {
    const pageSize = 2
    const voter = await createTestUserDirect({ username: randomUsername() })
    const postIds = await Promise.all([1, 2, 3].map(() => createPost(voter!.id)))
    const targets = await Promise.all(
      [1, 2].map(() => createTestUserDirect({ username: randomUsername() })),
    )
    for (const postId of postIds) await insertPostElectionVote(voter!.id, postId, 1)
    for (const target of targets) await insertUserVouchElectionVote(voter!.id, target!.id, 1)
    const expected = [...postIds, ...targets.map(target => target!.id)].toSorted()

    const restore = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
      elections_page_size: pageSize,
    })
    const pages: ElectionUpdatePage[] = []
    try {
      let cursor: ElectionUpdatePage['nextCursor'] = null
      do {
        const page = await enqueueElectionUpdatePageForUser(voter!.id, cursor)
        pages.push(page)
        cursor = page.nextCursor
      } while (cursor)
    } finally {
      restore()
    }

    expect(pages.map(page => page.jobIds.length)).toEqual([2, 2, 1])
    expect(pages.map(page => page.nextCursor === null)).toEqual([false, false, true])
    const covered: string[] = []
    for (const page of pages) {
      for (const jobId of page.jobIds) {
        const job = await voteAggregation.getJob(jobId)
        expect(job!.name).toBe(ELECTION_JOB_NAME)
        covered.push((job!.data as { electionId: string }).electionId)
      }
    }
    expect(covered.toSorted()).toEqual(expected)
  })

  it('ends on an empty page when the votes fill the last page exactly', async () => {
    const voter = await createTestUserDirect({ username: randomUsername() })
    const postIds = await Promise.all([1, 2].map(() => createPost(voter!.id)))
    for (const postId of postIds) await insertPostElectionVote(voter!.id, postId, 1)

    const restore = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
      elections_page_size: 2,
    })
    try {
      const first = await enqueueElectionUpdatePageForUser(voter!.id, null)
      expect(first.jobIds).toHaveLength(2)
      expect(first.nextCursor).not.toBeNull()
      await expect(enqueueElectionUpdatePageForUser(voter!.id, first.nextCursor)).resolves.toEqual({
        jobIds: [],
        nextCursor: null,
      })
    } finally {
      restore()
    }
  })
})
