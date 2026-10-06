import { describe, expect, it, vi } from 'vitest'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { createTestTerritorialRestrictionScene } from '@voucha/test-helpers/copyright-territorial-restriction-fixtures'
import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import {
  countTestDsaSubmissionsForRestriction,
  liftTestCopyrightRestriction,
} from '@voucha/test-helpers/dsa-statement-submission-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  processCopyrightActionIntent,
  recordEuCopyrightStatementOfReasons,
  recordUkCopyrightReview,
} from './index.mts'
import {
  openHeldCounterNoticeRestore,
  recordOrdinaryCopyrightHold,
} from './restoration-hold-scene.mts'
import {
  materializeDsaStatementSubmissions,
  prepareDsaStatementSubmissionSweep,
  type DsaStatementSweepDependencies,
} from './dsa-statement-submission-sweep.mts'

async function restrictionIdFor(noticeId: string): Promise<string> {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const [restriction] = aggregate?.restrictions ?? []
  if (!restriction) throw new Error('Expected a restriction')
  return restriction.id
}

describe('DSA statement submission materialization', () => {
  it('stops before searching or recording work when the configured start date is absent', async () => {
    const warning = vi.fn<DsaStatementSweepDependencies['recordConfigMissing']>()
    const buildPayload = vi.fn<DsaStatementSweepDependencies['buildPayload']>()

    await expect(
      prepareDsaStatementSubmissionSweep({
        isEnabled: async () => true,
        getFrom: async () => null,
        recordConfigMissing: warning,
        buildPayload,
      }),
    ).resolves.toBeNull()
    expect(warning).toHaveBeenCalledExactlyOnceWith(
      'processReconcileDsaStatementSubmissions',
      'copyright.dsaSorDatabaseFrom',
    )
    expect(buildPayload).not.toHaveBeenCalled()
  })

  it('records each eligible restriction once across cutoff, lift, and jurisdiction', async () => {
    const from = new Date('2026-07-01T00:00:00.000Z')
    const dayBefore = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
      new Date('2026-06-30T23:59:59.000Z'),
    )
    const midnight = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
      from,
    )
    const lifted = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    await liftTestCopyrightRestriction(lifted.restrictionId)

    const eu = await createTestTerritorialRestrictionScene('eu_dsa')
    await recordEuCopyrightStatementOfReasons(eu.staff, eu.noticeId, {
      text: 'Private EU statement.',
      publicExplanation: 'Copyright was shown.',
      outcome: 'restrict',
      targets: eu.targets,
    })
    const uk = await createTestTerritorialRestrictionScene('uk')
    await recordUkCopyrightReview(uk.staff, uk.noticeId, {
      text: 'Private UK review.',
      publicExplanation: 'Copyright was shown.',
      outcome: 'restrict',
      targets: uk.targets,
    })
    const dependencies = createTestCopyrightDeliveryDependencies(async () => undefined)
    const court = await openHeldCounterNoticeRestore(dependencies)
    await expect(
      processCopyrightActionIntent(court.restore.id, court.restorationAt, dependencies),
    ).resolves.toBe('applied')
    await recordOrdinaryCopyrightHold(court, dependencies.prepublishImagePlacementDenial)
    const courtRestrictions =
      (await getCopyrightNoticePrivateAggregate(court.notice.id))?.restrictions ?? []
    expect(courtRestrictions).toHaveLength(2)
    const reimposed = courtRestrictions.find(row => row.id !== court.restriction.id)
    if (!reimposed) throw new Error('Court hold did not reimpose a restriction')

    const warning = vi.fn<DsaStatementSweepDependencies['recordConfigMissing']>()
    expect(
      await prepareDsaStatementSubmissionSweep({
        isEnabled: async () => false,
        getFrom: async () => from,
        recordConfigMissing: warning,
      }),
    ).toBeNull()
    expect(await countTestDsaSubmissionsForRestriction(midnight.restrictionId)).toBe(0)
    expect(
      await prepareDsaStatementSubmissionSweep({
        isEnabled: async () => true,
        getFrom: async () => null,
        recordConfigMissing: warning,
      }),
    ).toBeNull()
    expect(warning).toHaveBeenCalledExactlyOnceWith(
      'processReconcileDsaStatementSubmissions',
      'copyright.dsaSorDatabaseFrom',
    )
    expect(await countTestDsaSubmissionsForRestriction(midnight.restrictionId)).toBe(0)

    const foreign = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const eligibleIds = [
      midnight.restrictionId,
      lifted.restrictionId,
      await restrictionIdFor(eu.noticeId),
      await restrictionIdFor(uk.noticeId),
      court.restriction.id,
      reimposed.id,
    ]
    const scope = [...eligibleIds, dayBefore.restrictionId]
    await materializeDsaStatementSubmissions(from, { restrictionIds: scope })
    const missingCredentials = vi.fn<DsaStatementSweepDependencies['recordConfigMissing']>()
    expect(
      await prepareDsaStatementSubmissionSweep({
        isEnabled: async () => true,
        getFrom: async () => from,
        url: () => '',
        token: () => '',
        recordConfigMissing: missingCredentials,
        restrictionIds: scope,
      }),
    ).toBeNull()
    expect(missingCredentials).toHaveBeenCalledExactlyOnceWith(
      'processReconcileDsaStatementSubmissions',
      'DSA_TRANSPARENCY_DATABASE_URL and DSA_TRANSPARENCY_DATABASE_TOKEN',
    )
    for (const id of eligibleIds) {
      expect(await countTestDsaSubmissionsForRestriction(id)).toBe(1)
    }
    expect(await countTestDsaSubmissionsForRestriction(dayBefore.restrictionId)).toBe(0)
    expect(await countTestDsaSubmissionsForRestriction(foreign.restrictionId)).toBe(0)
    expect(await materializeDsaStatementSubmissions(from, { restrictionIds: scope })).toBe(0)
  })
})
