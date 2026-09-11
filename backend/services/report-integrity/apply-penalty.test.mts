import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import {
  createTestUserDirect,
  insertTestReportIntegrityFlag,
  getTestReportAbusePenaltiesByFlagId,
  getTestReportAbusePenaltiesByUserId,
  getTestReportIntegrityFlagsByUserId,
  getTestUserBadFaithReporterAt,
} from '@voucha/test-helpers'
import { applyReportAbusePenalty } from './apply-penalty.mts'
import { revokeReportAbusePenalty } from './revoke-penalty.mts'
import { resolveReportIntegrityFlag } from './resolve-flag.mts'
import type { PrivateUser } from '@services/users/types'
import { isJwtStale } from '@services/jwt-session/invalidation'

describe('applyReportAbusePenalty / revokeReportAbusePenalty', () => {
  const randomUsername = () => `test-ri-penalty-${randomBytes(4).toString('hex')}`

  let adminUser: PrivateUser

  beforeAll(async () => {
    adminUser = await createTestUserDirect({ username: randomUsername() })
  }, 60_000)

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
    await Promise.all([reporter1.id, reporter2.id, reporter3.id].map(expectJwtStale))
  }, 60_000)

  it('skips reporters whose accounts no longer exist', async () => {
    const targetUser = await createTestUserDirect({ username: randomUsername() })
    const reporter = await createTestUserDirect({ username: randomUsername() })
    // A reporter captured at detection but hard-deleted before actioning. Use a
    // v7 UUID that does not exist in users — the FK JOIN must skip it, not fail.
    const missingReporterId = '01923456-789a-7bcd-8ef0-123456789abc'

    const flagId = await insertTestReportIntegrityFlag({
      reportedUserId: targetUser.id,
      reporterUserIds: [reporter.id, missingReporterId],
    })

    const result = await applyReportAbusePenalty(adminUser.id, flagId)
    expect(result.penalized_user_count).toBe(1)
    expect(result.flag).toMatchObject({ id: flagId, resolution: 'penalized' })
    expect(result.penalties.map(p => p.user_id)).toEqual([reporter.id])
    expect(result.penalties[0]!.id).toBeTruthy()
    expect(await getTestUserBadFaithReporterAt(reporter.id)).not.toBeNull()
  }, 60_000)

  it('throws 409 when the flag is already resolved (one-shot)', async () => {
    const targetUser = await createTestUserDirect({ username: randomUsername() })
    const reporter = await createTestUserDirect({ username: randomUsername() })

    const flagId = await insertTestReportIntegrityFlag({
      reportedUserId: targetUser.id,
      reporterUserIds: [reporter.id],
    })

    const first = await applyReportAbusePenalty(adminUser.id, flagId)
    expect(first.penalized_user_count).toBe(1)

    await expect(applyReportAbusePenalty(adminUser.id, flagId)).rejects.toThrow(
      'Flag is already resolved',
    )

    const penalties = await getTestReportAbusePenaltiesByFlagId(flagId)
    expect(penalties).toHaveLength(1)
  }, 60_000)

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

    const [storedFlag] = (await getTestReportIntegrityFlagsByUserId(targetUser.id)).filter(
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
  }, 60_000)

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

    await revokeReportAbusePenalty(adminUser.id, penalty!.id)

    expect(await getTestUserBadFaithReporterAt(reporter.id)).toBeNull()

    const updatedPenalties = await getTestReportAbusePenaltiesByUserId(reporter.id)
    const updatedPenalty = updatedPenalties.find(p => p.id === penalty!.id)
    expect(updatedPenalty?.revoked_at).not.toBeNull()
  }, 60_000)

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
  }, 60_000)
})

async function expectJwtStale(userId: string): Promise<void> {
  await expect.poll(() => isJwtStale(userId)).toBe(true)
}
