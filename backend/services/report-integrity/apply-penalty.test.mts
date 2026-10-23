import { describe, it, expect, beforeAll, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  createTestUserDirect,
  insertTestReportIntegrityFlag,
  getTestReportAbusePenaltiesByFlagId,
  getTestReportAbusePenaltiesByUserId,
  getTestReportIntegrityFlagReporterIds,
  getTestReportIntegrityFlagsByUserId,
  getTestUserBadFaithReporterAt,
  hardDeleteTestUser,
} from '@voucha/test-helpers'
import { applyReportAbusePenalty } from './apply-penalty.mts'
import { revokeReportAbusePenalty } from './revoke-penalty.mts'
import { resolveReportIntegrityFlag } from './resolve-flag.mts'
import type { PrivateUser } from '@services/users/types'
import { getJwtStaleKey, isJwtStale } from '@data-stores/valkey/jwt-stale'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { withPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { sentryCaptureExceptionMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'

describe('applyReportAbusePenalty / revokeReportAbusePenalty', () => {
  const randomUsername = () => `test-ri-penalty-${randomBytes(4).toString('hex')}`

  let adminUser: PrivateUser

  beforeAll(async () => {
    adminUser = await createTestUserDirect({ username: randomUsername() })
  }, 5_000)

  it('penalizes the persisted reporter set and sets bad_faith_reporter_at', async () => {
    const targetUser = await createTestUserDirect({ username: randomUsername() })
    const reporter1 = await createTestUserDirect({ username: randomUsername() })
    const reporter2 = await createTestUserDirect({ username: randomUsername() })
    const reporter3 = await createTestUserDirect({ username: randomUsername() })

    const flagId = await insertTestReportIntegrityFlag({
      reportedUserId: targetUser.id,
      reporterUserIds: [reporter1.id, reporter2.id, reporter3.id],
    })

    const result = await applyReportAbusePenalty(adminUser.id, flagId)
    expect(result.penalized_user_count).toBe(3)
    expect(result.flag).toMatchObject({
      id: flagId,
      resolution: 'penalized',
      resolved_by_id: adminUser.id,
    })
    expect(result.flag.resolved_at).not.toBeNull()

    const penalties = await getTestReportAbusePenaltiesByFlagId(flagId)
    expect(penalties).toHaveLength(3)
    const penalizedUserIds = penalties.map(p => p.user_id)
    expect(penalizedUserIds).toContain(reporter1.id)
    expect(penalizedUserIds).toContain(reporter2.id)
    expect(penalizedUserIds).toContain(reporter3.id)

    expect(await getTestUserBadFaithReporterAt(reporter1.id)).not.toBeNull()
    expect(await getTestUserBadFaithReporterAt(reporter2.id)).not.toBeNull()
    expect(await getTestUserBadFaithReporterAt(reporter3.id)).not.toBeNull()
    expect(await Promise.all([reporter1.id, reporter2.id, reporter3.id].map(isJwtStale))).toEqual([
      true,
      true,
      true,
    ])
  })

  it('skips reporters whose accounts no longer exist', async () => {
    const targetUser = await createTestUserDirect({ username: randomUsername() })
    const reporter = await createTestUserDirect({ username: randomUsername() })
    const deletedReporter = await createTestUserDirect({ username: randomUsername() })

    const flagId = await insertTestReportIntegrityFlag({
      reportedUserId: targetUser.id,
      reporterUserIds: [reporter.id, deletedReporter.id],
    })
    // A reporter captured at detection but hard-deleted before actioning leaves the reporter set
    // with the user row (ON DELETE CASCADE), so the penalty applies only to the remaining reporters.
    await hardDeleteTestUser(deletedReporter.id)
    await expect(getTestReportIntegrityFlagReporterIds(flagId)).resolves.toEqual([reporter.id])

    const result = await applyReportAbusePenalty(adminUser.id, flagId)
    expect(result.penalized_user_count).toBe(1)
    expect(result.flag).toMatchObject({ id: flagId, resolution: 'penalized' })
    expect(result.penalties.map(p => p.user_id)).toEqual([reporter.id])
    expect(result.penalties[0]!.id).toBeTruthy()
    expect(await getTestUserBadFaithReporterAt(reporter.id)).not.toBeNull()
  })

  it('throws 409 when the flag is already resolved (one-shot)', async () => {
    const targetUser = await createTestUserDirect({ username: randomUsername() })
    const reporter = await createTestUserDirect({ username: randomUsername() })

    const flagId = await insertTestReportIntegrityFlag({
      reportedUserId: targetUser.id,
      reporterUserIds: [reporter.id],
    })

    const first = await applyReportAbusePenalty(adminUser.id, flagId)
    expect(first.penalized_user_count).toBe(1)

    await expect(applyReportAbusePenalty(adminUser.id, flagId)).rejects.toMatchObject({
      status: 409,
      message: 'Flag is already resolved',
    })

    const penalties = await getTestReportAbusePenaltiesByFlagId(flagId)
    expect(penalties).toHaveLength(1)
  })

  it('claims a flag inserted in the supplied transaction without requiring another client', async () => {
    const targetUser = await createTestUserDirect({ username: randomUsername() })
    await withPostgresTransactionForTest(async query => {
      const flagId = await insertTestReportIntegrityFlag({
        reportedUserId: targetUser.id,
        query,
      })
      const result = await applyReportAbusePenalty(adminUser.id, flagId, { query })
      expect(result.flag).toMatchObject({ id: flagId, resolution: 'penalized' })
    })
    expect(await getTestReportIntegrityFlagsByUserId(targetUser.id)).toEqual([])
  })

  it('distinguishes a missing flag from an already resolved flag', async () => {
    await expect(applyReportAbusePenalty(adminUser.id, crypto.randomUUID())).rejects.toMatchObject({
      status: 404,
    })
  })

  it.each(['success', 'failure'] as const)(
    'waits for the post-commit JWT marker write before returning (%s)',
    async outcome => {
      const targetUser = await createTestUserDirect({ username: randomUsername() })
      const reporter = await createTestUserDirect({ username: randomUsername() })
      const flagId = await insertTestReportIntegrityFlag({
        reportedUserId: targetUser.id,
        reporterUserIds: [reporter.id],
      })
      const entered = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const originalSet = sessionValkeyClient.set
      const failure = new Error('Owned JWT marker write failure')
      const markerKey = getJwtStaleKey(reporter.id)
      let operation: ReturnType<typeof applyReportAbusePenalty> | undefined
      const set = vi.spyOn(sessionValkeyClient, 'set').mockImplementation((key, ...args) => {
        if (key !== markerKey) return originalSet.call(sessionValkeyClient, key, ...args)
        entered.resolve()
        return release.promise.then(() =>
          outcome === 'failure'
            ? Promise.reject(failure)
            : originalSet.call(sessionValkeyClient, key, ...args),
        )
      })

      try {
        let completed = false
        operation = applyReportAbusePenalty(adminUser.id, flagId).then(result => {
          completed = true
          return result
        })
        await entered.promise

        expect(await getTestReportAbusePenaltiesByFlagId(flagId)).toHaveLength(1)
        expect(completed).toBe(false)
        release.resolve()
        await expect(operation).resolves.toMatchObject({ penalized_user_count: 1 })
        expect(await isJwtStale(reporter.id)).toBe(outcome === 'success')
        expect(
          sentryCaptureExceptionMock.mock.calls.filter(([error]) => error === failure),
        ).toHaveLength(outcome === 'failure' ? 1 : 0)
      } finally {
        release.resolve()
        await operation?.catch(() => undefined)
        set.mockRestore()
      }
    },
  )

  it('commits exactly one terminal outcome when dismissal races reporter penalties', async () => {
    const targetUser = await createTestUserDirect({ username: randomUsername() })
    const reporter = await createTestUserDirect({ username: randomUsername() })
    const flagId = await insertTestReportIntegrityFlag({
      reportedUserId: targetUser.id,
      reporterUserIds: [reporter.id],
    })

    const [dismissal, penalty] = await Promise.allSettled([
      resolveReportIntegrityFlag(flagId, adminUser.id, 'dismissed'),
      applyReportAbusePenalty(adminUser.id, flagId),
    ])

    expect([dismissal, penalty].filter(result => result.status === 'fulfilled')).toHaveLength(1)

    const storedFlag = (await getTestReportIntegrityFlagsByUserId(targetUser.id)).find(
      flag => flag.id === flagId,
    )
    const penalties = await getTestReportAbusePenaltiesByFlagId(flagId)

    const outcome = {
      dismissal: dismissal.status,
      penalty: penalty.status,
      resolution: storedFlag?.resolution,
      penaltyCount: penalties.length,
      reporterWasPenalized: (await getTestUserBadFaithReporterAt(reporter.id)) !== null,
    }
    expect([
      {
        dismissal: 'fulfilled',
        penalty: 'rejected',
        resolution: 'dismissed',
        penaltyCount: 0,
        reporterWasPenalized: false,
      },
      {
        dismissal: 'rejected',
        penalty: 'fulfilled',
        resolution: 'penalized',
        penaltyCount: 1,
        reporterWasPenalized: true,
      },
    ]).toContainEqual(outcome)
  })

  it('revoke clears bad_faith_reporter_at when last active penalty removed', async () => {
    const targetUser = await createTestUserDirect({ username: randomUsername() })
    const reporter = await createTestUserDirect({ username: randomUsername() })

    const flagId = await insertTestReportIntegrityFlag({
      reportedUserId: targetUser.id,
      reporterUserIds: [reporter.id],
    })

    await applyReportAbusePenalty(adminUser.id, flagId)
    expect(await getTestUserBadFaithReporterAt(reporter.id)).not.toBeNull()

    const userPenalties = await getTestReportAbusePenaltiesByUserId(reporter.id)
    const penalty = userPenalties.find(p => p.source_flag_id === flagId)
    expect(penalty).toBeDefined()

    const markerKey = getJwtStaleKey(reporter.id)
    await sessionValkeyClient.unlink([markerKey])
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const originalSet = sessionValkeyClient.set
    let operation: ReturnType<typeof revokeReportAbusePenalty> | undefined
    const set = vi.spyOn(sessionValkeyClient, 'set').mockImplementation((key, ...args) => {
      if (key !== markerKey) return originalSet.call(sessionValkeyClient, key, ...args)
      entered.resolve()
      return release.promise.then(() => originalSet.call(sessionValkeyClient, key, ...args))
    })

    try {
      let completed = false
      operation = revokeReportAbusePenalty(adminUser.id, penalty!.id).then(result => {
        completed = true
        return result
      })
      await entered.promise

      expect(await getTestUserBadFaithReporterAt(reporter.id)).toBeNull()
      expect(completed).toBe(false)
      release.resolve()
      await expect(operation).resolves.toMatchObject({ penaltyId: penalty!.id })
      await expect(isJwtStale(reporter.id)).resolves.toBe(true)

      const updatedPenalties = await getTestReportAbusePenaltiesByUserId(reporter.id)
      expect(updatedPenalties.find(p => p.id === penalty!.id)?.revoked_at).not.toBeNull()
    } finally {
      release.resolve()
      await operation?.catch(() => undefined)
      set.mockRestore()
    }
  })

  it('revoke throws 404 on an already-revoked penalty', async () => {
    const targetUser = await createTestUserDirect({ username: randomUsername() })
    const reporter = await createTestUserDirect({ username: randomUsername() })

    const flagId = await insertTestReportIntegrityFlag({
      reportedUserId: targetUser.id,
      reporterUserIds: [reporter.id],
    })
    await applyReportAbusePenalty(adminUser.id, flagId)

    const userPenalties = await getTestReportAbusePenaltiesByUserId(reporter.id)
    const penalty = userPenalties.find(p => p.source_flag_id === flagId)
    expect(penalty).toBeDefined()

    await revokeReportAbusePenalty(adminUser.id, penalty!.id)

    await expect(revokeReportAbusePenalty(adminUser.id, penalty!.id)).rejects.toThrow(
      'Report abuse penalty not found or already revoked',
    )
  })
})
