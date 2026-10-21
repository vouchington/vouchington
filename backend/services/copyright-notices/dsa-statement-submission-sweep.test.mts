import {
  createTestDsaApprovalWithdrawalScene,
  readTestDsaReceiptApproval,
} from '@voucha/test-helpers/dsa-approval-withdrawal-fixtures'
import { readTestDsaSubmissionForRestriction } from '@voucha/test-helpers/dsa-statement-build-failure-fixtures'
import { withdrawCopyrightJurisdictionPolicyApproval } from './jurisdiction-policy.mts'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { copyrightSweepConfig } from './work-limits.mts'
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
} from '@voucha/test-helpers/copyright-restoration-hold-scene'
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
  it('reports remaining materialization work through the configured sweep and resumes next tick', async () => {
    onTestFinished(overrideDynamicConfigFieldsForTest(copyrightSweepConfig, { batch_size: 1 }))
    const from = new Date('2026-07-01T00:00:00.000Z')
    const first = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const second = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const options = {
      isEnabled: async () => true,
      getFrom: async () => from,
      url: () => 'https://dsa.example.test',
      token: () => 'synthetic-dsa-token',
      restrictionIds: [first.restrictionId, second.restrictionId],
    }

    await expect(prepareDsaStatementSubmissionSweep(options)).resolves.toEqual({
      from,
      hasMore: true,
    })
    expect(await countTestDsaSubmissionsForRestriction(first.restrictionId)).toBe(1)
    expect(await countTestDsaSubmissionsForRestriction(second.restrictionId)).toBe(0)
    await expect(prepareDsaStatementSubmissionSweep(options)).resolves.toEqual({
      from,
      hasMore: false,
    })
    expect(await countTestDsaSubmissionsForRestriction(first.restrictionId)).toBe(1)
    expect(await countTestDsaSubmissionsForRestriction(second.restrictionId)).toBe(1)
  })

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
    expect(await materializeDsaStatementSubmissions(from, { restrictionIds: scope })).toEqual({
      inserted: 0,
      hasMore: false,
    })
  })

  it('materializes an existing restriction after its receipt approval is withdrawn before the first sweep', async () => {
    const scene = await createTestDsaApprovalWithdrawalScene()
    await recordEuCopyrightStatementOfReasons(scene.staff, scene.noticeId, {
      text: 'Private EU statement.',
      publicExplanation: 'Copyright was shown.',
      outcome: 'restrict',
      targets: scene.targets,
    })
    const restrictionId = await restrictionIdFor(scene.noticeId)
    const foreign = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    expect(await readTestDsaReceiptApproval(scene.noticeId)).toEqual({
      approval_id: scene.approvalId,
      withdrawal_id: null,
    })
    expect(await countTestDsaSubmissionsForRestriction(restrictionId)).toBe(0)
    const withdrawal = await withdrawCopyrightJurisdictionPolicyApproval(
      scene.administrator,
      scene.approvalId,
    )
    expect(await readTestDsaReceiptApproval(scene.noticeId)).toEqual({
      approval_id: scene.approvalId,
      withdrawal_id: withdrawal.id,
    })
    expect(await countTestDsaSubmissionsForRestriction(restrictionId)).toBe(0)
    const from = new Date('2026-07-01T00:00:00.000Z')
    const scope = { restrictionIds: [restrictionId] }
    expect(await materializeDsaStatementSubmissions(from, scope)).toEqual({
      inserted: 1,
      hasMore: false,
    })
    expect(await countTestDsaSubmissionsForRestriction(restrictionId)).toBe(1)
    const submission = await readTestDsaSubmissionForRestriction(restrictionId)
    expect(submission.payload?.puid).toBe(restrictionId)
    expect(submission.failed_at).toBeNull()
    expect(submission.failure_code).toBeNull()
    expect(await countTestDsaSubmissionsForRestriction(foreign.restrictionId)).toBe(0)
    expect(await materializeDsaStatementSubmissions(from, scope)).toEqual({
      inserted: 0,
      hasMore: false,
    })
    expect(await readTestDsaSubmissionForRestriction(restrictionId)).toEqual(submission)
    expect(await countTestDsaSubmissionsForRestriction(foreign.restrictionId)).toBe(0)
  })
})
