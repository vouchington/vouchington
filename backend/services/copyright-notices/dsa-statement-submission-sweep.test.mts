import {
  createTestDsaApprovalWithdrawalScene,
  readTestDsaReceiptApproval,
} from '@voucha/test-helpers/dsa-approval-withdrawal-fixtures'
import { readTestDsaSubmissionForRestriction } from '@voucha/test-helpers/dsa-statement-build-failure-fixtures'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import Sentry from '@modules/on-error/sentry'
import { overrideDsaStatementSubmissionConfigForTest } from '@voucha/test-helpers/dsa-switches'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { copyrightSweepConfig } from './work-limits.mts'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import {
  countTestDsaSubmissionsForRestriction,
  liftTestCopyrightRestriction,
} from '@voucha/test-helpers/dsa-statement-submission-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { seedDsaProjectionDecision } from '@voucha/test-helpers/copyright-dsa-projection-prerequisites'
import {
  seedCompletedStatutoryContract,
  seedStatutoryContractHold,
} from '@voucha/test-helpers/copyright-statutory-contract-fixtures'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { prepareDsaStatementSubmissionSweep } from './dsa-statement-submission-sweep.mts'

async function configureSweep(
  fields: { dsaSorDatabase?: boolean; dsaSorDatabaseFrom?: string } = {},
  credentials: { url: string; token: string } = {
    url: 'https://dsa.example.test',
    token: 'synthetic-dsa-token',
  },
): Promise<void> {
  vi.stubEnv('DSA_TRANSPARENCY_DATABASE_URL', credentials.url)
  vi.stubEnv('DSA_TRANSPARENCY_DATABASE_TOKEN', credentials.token)
  onTestFinished(await overrideDsaStatementSubmissionConfigForTest(fields))
}

function configMissingReport(missingEnvVar: string) {
  return [
    'scheduled_job_config_missing',
    {
      level: 'warning',
      tags: {
        reason: 'scheduled_job_config_missing',
        jobName: 'processReconcileDsaStatementSubmissions',
        missingEnvVar,
      },
    },
  ] as const
}

async function restrictionIdFor(noticeId: string): Promise<string> {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const [restriction] = aggregate?.restrictions ?? []
  if (!restriction) throw new Error('Expected a restriction')
  return restriction.id
}

describe('DSA statement submission materialization', () => {
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('reports remaining materialization work through the configured sweep and resumes next tick', async () => {
    onTestFinished(overrideDynamicConfigFieldsForTest(copyrightSweepConfig, { batch_size: 1 }))
    const from = new Date('2026-07-01T00:00:00.000Z')
    const first = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const second = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    await configureSweep({ dsaSorDatabaseFrom: '2026-07-01' })
    const options = { restrictionIds: [first.restrictionId, second.restrictionId] }

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
    const restriction = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    await configureSweep({ dsaSorDatabaseFrom: '' })
    const warning = vi.spyOn(Sentry, 'captureMessage').mockReturnValue('')

    await expect(
      prepareDsaStatementSubmissionSweep({ restrictionIds: [restriction.restrictionId] }),
    ).resolves.toBeNull()
    expect(warning).toHaveBeenCalledExactlyOnceWith(
      ...configMissingReport('copyright.dsaSorDatabaseFrom'),
    )
    expect(await countTestDsaSubmissionsForRestriction(restriction.restrictionId)).toBe(0)
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

    const eu = await createTestDsaApprovalWithdrawalScene('eu_dsa')
    await seedDsaProjectionDecision('eu_dsa', eu.staff, eu.noticeId, {
      text: 'Private EU statement.',
      publicExplanation: 'Copyright was shown.',
      outcome: 'restrict',
      targets: eu.targets,
    })
    const uk = await createTestDsaApprovalWithdrawalScene('uk')
    await seedDsaProjectionDecision('uk', uk.staff, uk.noticeId, {
      text: 'Private UK review.',
      publicExplanation: 'Copyright was shown.',
      outcome: 'restrict',
      targets: uk.targets,
    })
    const court = await openHeldCounterNoticeRestore()
    await seedCompletedStatutoryContract(court)
    await seedStatutoryContractHold(court)
    const courtRestrictions =
      (await getCopyrightNoticePrivateAggregate(court.notice.id))?.restrictions ?? []
    expect(courtRestrictions).toHaveLength(2)
    const reimposed = courtRestrictions.find(row => row.id !== court.restriction.id)
    if (!reimposed) throw new Error('Court hold did not reimpose a restriction')

    const warning = vi.spyOn(Sentry, 'captureMessage').mockReturnValue('')
    const restoreOff = await overrideDsaStatementSubmissionConfigForTest({
      dsaSorDatabase: false,
      dsaSorDatabaseFrom: '2026-07-01',
    })
    onTestFinished(restoreOff)
    expect(
      await prepareDsaStatementSubmissionSweep({ restrictionIds: [midnight.restrictionId] }),
    ).toBeNull()
    restoreOff()
    expect(await countTestDsaSubmissionsForRestriction(midnight.restrictionId)).toBe(0)
    const restoreUnset = await overrideDsaStatementSubmissionConfigForTest({
      dsaSorDatabaseFrom: '',
    })
    onTestFinished(restoreUnset)
    expect(
      await prepareDsaStatementSubmissionSweep({ restrictionIds: [midnight.restrictionId] }),
    ).toBeNull()
    restoreUnset()
    expect(warning).toHaveBeenCalledExactlyOnceWith(
      ...configMissingReport('copyright.dsaSorDatabaseFrom'),
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
    warning.mockClear()
    await configureSweep({ dsaSorDatabaseFrom: '2026-07-01' }, { url: '', token: '' })
    const options = { restrictionIds: scope }
    expect(await prepareDsaStatementSubmissionSweep(options)).toBeNull()
    expect(warning).toHaveBeenCalledExactlyOnceWith(
      ...configMissingReport('DSA_TRANSPARENCY_DATABASE_URL and DSA_TRANSPARENCY_DATABASE_TOKEN'),
    )
    for (const id of eligibleIds) {
      expect(await countTestDsaSubmissionsForRestriction(id)).toBe(1)
    }
    expect(await countTestDsaSubmissionsForRestriction(dayBefore.restrictionId)).toBe(0)
    expect(await countTestDsaSubmissionsForRestriction(foreign.restrictionId)).toBe(0)
    expect(await prepareDsaStatementSubmissionSweep(options)).toBeNull()
    expect(warning).toHaveBeenCalledTimes(2)
    for (const id of eligibleIds) {
      expect(await countTestDsaSubmissionsForRestriction(id)).toBe(1)
    }
  })

  it('materializes a restriction linked to a withdrawn receipt approval before the first sweep', async () => {
    const scene = await createTestDsaApprovalWithdrawalScene()
    await seedDsaProjectionDecision('eu_dsa', scene.staff, scene.noticeId, {
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
      withdrawal_id: scene.withdrawalId,
    })
    expect(await countTestDsaSubmissionsForRestriction(restrictionId)).toBe(0)
    await configureSweep({ dsaSorDatabaseFrom: '2026-07-01' }, { url: '', token: '' })
    const options = { restrictionIds: [restrictionId] }
    expect(await prepareDsaStatementSubmissionSweep(options)).toBeNull()
    expect(await countTestDsaSubmissionsForRestriction(restrictionId)).toBe(1)
    const submission = await readTestDsaSubmissionForRestriction(restrictionId)
    expect(submission.payload?.puid).toBe(restrictionId)
    expect(submission.failed_at).toBeNull()
    expect(submission.failure_code).toBeNull()
    expect(await countTestDsaSubmissionsForRestriction(foreign.restrictionId)).toBe(0)
    expect(await prepareDsaStatementSubmissionSweep(options)).toBeNull()
    expect(await readTestDsaSubmissionForRestriction(restrictionId)).toEqual(submission)
    expect(await countTestDsaSubmissionsForRestriction(foreign.restrictionId)).toBe(0)
  })
})
