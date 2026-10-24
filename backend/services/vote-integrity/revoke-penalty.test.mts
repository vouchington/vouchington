import { describe, expect, it, vi } from 'vitest'
import {
  createTestUserDirect,
  getTestPenaltiesByUserId,
  insertTestVoteWeightPenalty,
  safeUsername,
} from '@voucha/test-helpers'
import { voteAggregation } from '@queues/vote-aggregation/queues'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { revokeVoteWeightPenalty } from './revoke-penalty.mts'

describe('revokeVoteWeightPenalty', () => {
  it('revokes an active vote-weight penalty', async () => {
    const [penalizedUser, adminUser] = await Promise.all([
      createTestUserDirect({ username: safeUsername('revoke-penalty-user') }),
      createTestUserDirect({ username: safeUsername('revoke-penalty-admin') }),
    ])
    const penaltyId = await insertTestVoteWeightPenalty(penalizedUser!.id, adminUser!.id)

    const revoked = await revokeVoteWeightPenalty(penaltyId, adminUser!.id)

    expect(revoked.id).toBe(penaltyId)
    expect(revoked.user_id).toBe(penalizedUser!.id)
    expect(revoked.revoked_by_id).toBe(adminUser!.id)
    expect(revoked.revoked_at).toBeInstanceOf(Date)
  })

  it('waits for post-commit vote-weight admission after committing the revoke', async () => {
    const [penalizedUser, adminUser] = await Promise.all([
      createTestUserDirect({ username: safeUsername('revoke-admission-user') }),
      createTestUserDirect({ username: safeUsername('revoke-admission-admin') }),
    ])
    const penaltyId = await insertTestVoteWeightPenalty(penalizedUser!.id, adminUser!.id)
    const jobId = `voteWeight__${penalizedUser!.id}__force`
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const originalAddBulk = voteAggregation.addBulk
    let admitted: Awaited<ReturnType<typeof voteAggregation.addBulk>> | undefined
    const addBulk = vi.spyOn(voteAggregation, 'addBulk').mockImplementation(async jobs => {
      if (!jobs.some(job => job.opts?.jobId === jobId))
        return originalAddBulk.call(voteAggregation, jobs)
      entered.resolve()
      await release.promise
      admitted = await originalAddBulk.call(voteAggregation, jobs)
      return admitted
    })
    let operation: ReturnType<typeof revokeVoteWeightPenalty> | undefined

    try {
      let completed = false
      operation = revokeVoteWeightPenalty(penaltyId, adminUser!.id).then(result => {
        completed = true
        return result
      })
      await entered.promise

      expect(await getTestPenaltiesByUserId(penalizedUser!.id)).toMatchObject([
        { id: penaltyId, revoked_at: expect.any(Date) },
      ])
      expect(completed).toBe(false)
      release.resolve()
      await expect(operation).resolves.toMatchObject({ id: penaltyId })
      expect(await voteAggregation.getJob(jobId)).toMatchObject({
        data: {
          userId: penalizedUser!.id,
          forceRecalculate: true,
        },
      })
    } finally {
      release.resolve()
      await operation?.catch(() => undefined)
      await Promise.all(admitted?.map(job => job.remove()) ?? [])
      addBulk.mockRestore()
    }
  })

  it('reports a failed queue admission once without undoing the revoke', async () => {
    const [penalizedUser, adminUser] = await Promise.all([
      createTestUserDirect({ username: safeUsername('revoke-failure-user') }),
      createTestUserDirect({ username: safeUsername('revoke-failure-admin') }),
    ])
    const penaltyId = await insertTestVoteWeightPenalty(penalizedUser!.id, adminUser!.id)
    const jobId = `voteWeight__${penalizedUser!.id}__force`
    const failure = new Error('Owned vote-weight revoke admission failure')
    const reportOffset = sentryCaptureExceptionMock.mock.calls.length
    const originalAddBulk = voteAggregation.addBulk
    const addBulk = vi.spyOn(voteAggregation, 'addBulk').mockImplementation(jobs => {
      if (jobs.some(job => job.opts?.jobId === jobId)) return Promise.reject(failure)
      return originalAddBulk.call(voteAggregation, jobs)
    })

    try {
      await expect(revokeVoteWeightPenalty(penaltyId, adminUser!.id)).resolves.toMatchObject({
        id: penaltyId,
      })
      expect(await getTestPenaltiesByUserId(penalizedUser!.id)).toMatchObject([
        { id: penaltyId, revoked_at: expect.any(Date) },
      ])
      expect(
        sentryCaptureExceptionMock.mock.calls
          .slice(reportOffset)
          .filter(([error]) => error === failure),
      ).toHaveLength(1)
    } finally {
      addBulk.mockRestore()
    }
  })

  it('rejects a second revoke of the same penalty', async () => {
    const [penalizedUser, adminUser] = await Promise.all([
      createTestUserDirect({ username: safeUsername('re-revoke-penalty-user') }),
      createTestUserDirect({ username: safeUsername('re-revoke-penalty-admin') }),
    ])
    const penaltyId = await insertTestVoteWeightPenalty(penalizedUser!.id, adminUser!.id)

    await revokeVoteWeightPenalty(penaltyId, adminUser!.id)

    await expect(revokeVoteWeightPenalty(penaltyId, adminUser!.id)).rejects.toMatchObject({
      status: 404,
    })
  })
})
