import { createSameIdElectionRelations } from '@voucha/test-helpers/entities/entity-relation-election-collisions'
import { insertTestEntityRelationVote } from '@voucha/test-helpers/entities/entity-relation-votes'
import { holdQueueBulkAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { v7 as uuidv7 } from 'uuid'
import { randomBytes } from 'node:crypto'
import {
  createTestUserDirect,
  createTestUser,
  insertTestPostVote,
  insertTestPost,
  getTestPenaltiesByFlagId,
  insertTestUrlHostname,
  insertTestVoteIntegrityFlag,
} from '@voucha/test-helpers'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { createVoteIntegrityFlag } from './create-flag.mts'
import { getVoteIntegrityFlagByIdFromPrimary } from './get-flags.mts'
import { applyVoteRingPenalty } from './apply-ring-penalty.mts'
import { DEFAULT_PENALTY_MULTIPLIER } from './config.mts'
import { revokeVoteWeightPenalty } from './revoke-penalty.mts'
import type { PrivateUser } from '@services/users/types'

describe('apply-ring-penalty', () => {
  const randomUsername = () => `test-vi-arp-${randomBytes(4).toString('hex')}`
  const randomSlug = () => `test-vi-arp-${randomBytes(6).toString('hex')}`

  let adminUser: PrivateUser
  let creatorUser: PrivateUser

  beforeAll(async () => {
    ;[adminUser, creatorUser] = await Promise.all([
      createTestUser({ administrator: true }) as Promise<PrivateUser>,
      createTestUserDirect({ username: randomUsername() }) as Promise<PrivateUser>,
    ])
  }, 5000)

  function makePost(slug: string): Promise<string> {
    return insertTestPost({
      title: `ARP Test ${slug}`,
      slug,
      createdById: creatorUser.id,
      markdown: 'test',
    })
  }

  describe('applyVoteRingPenalty', () => {
    it('keeps the hostname fact when applying a flag penalty', async () => {
      const hostname = `vote-penalty-${randomBytes(8).toString('hex')}.example.com`
      const hostnameId = await insertTestUrlHostname({ hostname })
      const flagId = await insertTestVoteIntegrityFlag({ hostnameId })

      const result = await applyVoteRingPenalty(flagId, adminUser.id)
      expect(result.flag).toMatchObject({ hostname_id: hostnameId, hostname })
    })

    it('creates penalties for all upvoters of the flagged entity', async () => {
      const postId = await makePost(randomSlug())

      const upvoters = await Promise.all(
        Array.from({ length: 3 }, () => createTestUserDirect({ username: randomUsername() })),
      )
      for (const user of upvoters) {
        await insertTestPostVote(postId, user!.id, '9.9.9.9', 1)
      }

      // Downvoter should not be penalized
      const downvoter = await createTestUserDirect({ username: randomUsername() })
      await insertTestPostVote(postId, downvoter!.id, '9.9.9.9', -1)

      const flag = await createVoteIntegrityFlag('post', postId, 'ip_correlation', {})
      expect(flag).not.toBeNull()

      const result = await applyVoteRingPenalty(flag!.id, adminUser.id)
      expect(result.penalized_user_count).toBe(3)

      expect(result.flag).toMatchObject({
        id: flag!.id,
        resolution: 'penalized',
        resolved_by_id: adminUser.id,
      })
      // Verify penalties have the correct multiplier
      const penalties = await getTestPenaltiesByFlagId(flag!.id)
      expect(penalties).toHaveLength(3)
      for (const penalty of penalties) {
        expect(penalty.penalty_multiplier).toBe(DEFAULT_PENALTY_MULTIPLIER)
        expect(penalty.reason).toBe('voting_ring')
        expect(penalty.revoked_at).toBeNull()
      }

      const resolvedFlag = await getVoteIntegrityFlagByIdFromPrimary(flag!.id)
      expect(resolvedFlag).toMatchObject({
        id: flag!.id,
        resolution: 'penalized',
        resolved_at: expect.any(Date),
        resolved_by_id: adminUser.id,
      })
    })

    it('penalizes only the concrete flagged family when target UUIDs collide', async () => {
      const fixture = await createSameIdElectionRelations({
        postCategory: 3,
        topicRelated: 7,
        viewerVotes: { postCategory: 1, topicRelated: -1 },
      })
      const otherFamilyVoter = await createTestUserDirect({ username: randomUsername() })
      await insertTestEntityRelationVote({
        relationTable: fixture.topicRelated.relationTable,
        relationId: fixture.id,
        subjectId: fixture.topicRelated.subjectId,
        userId: otherFamilyVoter.id,
        score: 1,
      })
      // Flag creation orders the fixed catalog; post/category precedes topic/related.
      const flag = await createVoteIntegrityFlag(
        'entity_relation',
        fixture.id,
        'ip_correlation',
        {},
      )
      if (!flag) throw new Error('Expected relation integrity flag')
      const result = await applyVoteRingPenalty(flag.id, adminUser.id)
      expect(result.penalized_user_count).toBe(1)
      const penalties = await getTestPenaltiesByFlagId(flag.id)
      expect(penalties.map(penalty => penalty.user_id)).toEqual([fixture.viewer.id])
    })

    it('returns penalized_user_count=0 when no upvoters exist', async () => {
      const postId = await makePost(randomSlug())
      const flag = await createVoteIntegrityFlag('post', postId, 'velocity_spike', {})
      expect(flag).not.toBeNull()

      const result = await applyVoteRingPenalty(flag!.id, adminUser.id)
      expect(result.penalized_user_count).toBe(0)
    })

    it('throws 404 for unknown flag ID', async () => {
      const request = applyVoteRingPenalty(uuidv7(), adminUser.id)
      await expect(request).rejects.toThrow(Error)
      await expect(request).rejects.toMatchObject({ status: 404 })
    })

    it('waits for post-commit bulk admission after committing ring penalties', async () => {
      const postId = await makePost(randomSlug())
      const upvoter = await createTestUserDirect({ username: randomUsername() })
      await insertTestPostVote(postId, upvoter!.id, '9.9.9.9', 1)
      const flag = await createVoteIntegrityFlag('post', postId, 'ip_correlation', {})
      expect(flag).not.toBeNull()

      const jobId = `voteWeight__${upvoter!.id}__force`
      const admission = holdQueueBulkAdmission(
        voteAggregation,
        'vote-aggregation.processRecalculateUserVoteWeight',
        data =>
          typeof data === 'object' &&
          data !== null &&
          'userId' in data &&
          data.userId === upvoter!.id &&
          'forceRecalculate' in data &&
          data.forceRecalculate === true,
      )
      let operation: ReturnType<typeof applyVoteRingPenalty> | undefined
      let admittedJobs: Awaited<typeof admission.admitted> = []
      const admittedJobsPromise = admission.admitted.then(jobs => {
        admittedJobs = jobs
        return jobs
      })
      void admittedJobsPromise.catch(() => undefined)
      let admissionStarted = false

      try {
        let completed = false
        operation = applyVoteRingPenalty(flag!.id, adminUser.id).then(result => {
          completed = true
          return result
        })
        await admission.entered
        admissionStarted = true

        expect(await getTestPenaltiesByFlagId(flag!.id)).toHaveLength(1)
        expect(await getVoteIntegrityFlagByIdFromPrimary(flag!.id)).toMatchObject({
          resolution: 'penalized',
        })
        expect(completed).toBe(false)
        admission.release()
        const [result, jobs] = await Promise.all([operation, admittedJobsPromise])
        expect(result).toMatchObject({ penalized_user_count: 1 })
        expect(jobs).toHaveLength(1)
        expect(await voteAggregation.getJob(jobId)).toMatchObject({
          data: { userId: upvoter!.id, forceRecalculate: true },
        })
      } finally {
        admission.release()
        await operation?.catch(() => undefined)
        if (admissionStarted) await admittedJobsPromise.catch(() => undefined)
        await Promise.all(admittedJobs.map(job => job.remove()))
        admission.restore()
      }
    })

    it('reports a failed queue admission once without undoing the ring penalty', async () => {
      const postId = await makePost(randomSlug())
      const upvoter = await createTestUserDirect({ username: randomUsername() })
      await insertTestPostVote(postId, upvoter!.id, '9.9.9.9', 1)
      const flag = await createVoteIntegrityFlag('post', postId, 'ip_correlation', {})
      expect(flag).not.toBeNull()

      const jobId = `voteWeight__${upvoter!.id}__force`
      const failure = new Error('Owned vote-weight bulk admission failure')
      const reportOffset = sentryCaptureExceptionMock.mock.calls.length
      const originalAddBulk = voteAggregation.addBulk
      const addBulk = vi.spyOn(voteAggregation, 'addBulk').mockImplementation(jobs => {
        if (jobs.some(job => job.opts?.jobId === jobId)) return Promise.reject(failure)
        return originalAddBulk.call(voteAggregation, jobs)
      })

      try {
        await expect(applyVoteRingPenalty(flag!.id, adminUser.id)).resolves.toMatchObject({
          penalized_user_count: 1,
        })
        expect(await getTestPenaltiesByFlagId(flag!.id)).toHaveLength(1)
        expect(
          sentryCaptureExceptionMock.mock.calls
            .slice(reportOffset)
            .filter(([error]) => error === failure),
        ).toHaveLength(1)
      } finally {
        addBulk.mockRestore()
      }
    })

    it('rejects a repeated request even after a penalty was revoked', async () => {
      const postId = await makePost(randomSlug())
      const upvoter = await createTestUserDirect({ username: randomUsername() })
      await insertTestPostVote(postId, upvoter!.id, '9.9.9.9', 1)
      const flag = await createVoteIntegrityFlag('post', postId, 'ip_correlation', {})
      const first = await applyVoteRingPenalty(flag!.id, adminUser.id)
      expect(first.penalized_user_count).toBe(1)
      const [penalty] = await getTestPenaltiesByFlagId(flag!.id)
      await revokeVoteWeightPenalty(penalty!.id, adminUser.id)
      await expect(applyVoteRingPenalty(flag!.id, adminUser.id)).rejects.toMatchObject({
        status: 409,
      })
      expect(await getTestPenaltiesByFlagId(flag!.id)).toHaveLength(1)
    })
  })
})
