import { afterEach, describe, expect, it, vi } from 'vitest'
import { getIsolatedDatabaseCaseMode } from '../../../test-helpers/vitest-isolated-database-cases.mts'
import { runIsolatedDatabaseCase } from '../../../test-helpers/vitest-isolated-database-case.mts'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { createTestReportingTrustedEuCase } from '@voucha/test-helpers/dsa-report-figure-fixtures'
import { createTestTerritorialRestrictionScene } from '@voucha/test-helpers/copyright-territorial-restriction-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { installTestMediaDeliveryEdge } from '@voucha/test-helpers/media-delivery-edge'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { createClearScreenedForm } from '@voucha/test-helpers/services/copyright-notices/screened-form'
import { readCopyrightNoticeTargetIds } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { deleteTestUser } from '@voucha/test-helpers/data-stores/psql/moderation-admission-relations'
import { createTestCopyrightDeliveryDependencies } from '@voucha/test-helpers/copyright-delivery-dependencies'
import { createTestTimedDsaReportAction } from '@voucha/test-helpers/dsa-report-timed-action'
import {
  COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA,
  type CopyrightLegalHoldGuidance,
} from '@ts-shared/utils/copyright-submission-guidance'
import {
  acceptCopyrightNoticeAndImposeRestriction,
  appendCopyrightSubmissionAssessment,
  processCopyrightActionIntent,
  recordEuCopyrightRedressDecision,
  recordUkCopyrightReview,
  submitEuCopyrightRedress,
  appendCopyrightNoticeSubmission,
} from './index.mts'
import { appendCopyrightSubmissionGuidance } from './submission-guidance.mts'
import {
  openHeldCounterNoticeRestore,
  recordOrdinaryCopyrightHold,
} from './restoration-hold-scene.mts'
import { readDsaCopyrightNoticeFigures } from './eu-reporting-notices.mts'

const period = () => ({
  start: new Date(Date.now() - 86_400_000),
  end: new Date(Date.now() + 86_400_000),
})

describe('DSA copyright notice aggregates', () => {
  useCopyrightIntakeEnvironment()
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('omits medians when no completed withhold qualifies', async () => {
    if (getIsolatedDatabaseCaseMode('copyright-dsa-notice-empty') === 'parent') {
      await runIsolatedDatabaseCase('copyright-dsa-notice-empty')
      return
    }
    const empty = await readDsaCopyrightNoticeFigures(
      new Date('2200-01-01T00:00:00.000Z'),
      new Date('2200-01-02T00:00:00.000Z'),
    )
    expect(empty).not.toHaveProperty('median_hours_to_action')
    expect(empty).not.toHaveProperty('median_hours_to_action_trusted_flagger')
    expect(empty.actions_on_terms_count).toBe(0)
  }, 240_000)

  it('counts every pipeline but only in-area flaggers for trusted figures', async () => {
    if (getIsolatedDatabaseCaseMode('copyright-dsa-notice-population') === 'parent') {
      await runIsolatedDatabaseCase('copyright-dsa-notice-population')
      return
    }
    installTestMediaDeliveryEdge()
    const { start, end } = period()
    const before = await readDsaCopyrightNoticeFigures(start, end)
    const us = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const inArea = await createTestReportingTrustedEuCase('intellectual_property', 'restrict')
    await createTestReportingTrustedEuCase('other', 'no_action')
    const uk = await createTestTerritorialRestrictionScene('uk')
    await recordUkCopyrightReview(uk.staff, uk.noticeId, {
      text: 'The identified image reproduces the protected photograph.',
      publicExplanation: 'The hosted image matches the notified work.',
      outcome: 'restrict',
      targets: uk.targets,
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(inArea.noticeId)
    const withhold = aggregate?.actionIntents.find(intent => intent.action === 'withhold')
    if (!withhold) throw new Error('EU restriction did not create a withhold intent')
    await processCopyrightActionIntent(withhold.id)
    const after = await readDsaCopyrightNoticeFigures(start, end)
    expect(after.notices_received_count - before.notices_received_count).toBe(4)
    expect(after.notified_items_count - before.notified_items_count).toBe(4)
    expect(
      after.notices_received_trusted_flagger_count - before.notices_received_trusted_flagger_count,
    ).toBe(1)
    expect(
      after.notified_items_trusted_flagger_count - before.notified_items_trusted_flagger_count,
    ).toBe(1)
    expect(after.actions_on_law_count - before.actions_on_law_count).toBe(3)
    expect(
      after.actions_on_law_trusted_flagger_count - before.actions_on_law_trusted_flagger_count,
    ).toBe(1)
    expect(after.actions_on_terms_count).toBe(0)
    expect(after.actions_on_terms_trusted_flagger_count).toBe(0)
    expect(after.median_hours_to_action_trusted_flagger).toEqual(expect.any(Number))
    expect(JSON.stringify(after)).not.toContain(inArea.suffix)
    expect((await getCopyrightNoticePrivateAggregate(us.noticeId))?.restrictions).toHaveLength(1)
    await deleteTestUser(us.moderator.id)
    const afterErasure = await readDsaCopyrightNoticeFigures(start, end)
    expect(afterErasure.notices_processed_by_automated_means_count).toBe(
      after.notices_processed_by_automated_means_count,
    )
    expect(afterErasure.restrictions_imposed_by_automated_means_count).toBe(
      after.restrictions_imposed_by_automated_means_count,
    )
    const complaint = await submitEuCopyrightRedress(
      inArea.claimant,
      inArea.noticeId,
      crypto.randomUUID(),
      'Please reverse this restriction.',
    )
    await recordEuCopyrightRedressDecision(inArea.staff, inArea.noticeId, complaint.id, {
      disposition: 'revoke',
      rationale: 'The reported material should be restored.',
    })
    const restored = (
      await getCopyrightNoticePrivateAggregate(inArea.noticeId)
    )?.actionIntents.find(intent => intent.action === 'restore')
    if (!restored) throw new Error('EU reversal did not create a restore intent')
    await processCopyrightActionIntent(restored.id)
    const afterRestore = await readDsaCopyrightNoticeFigures(start, end)
    expect(afterRestore.median_hours_to_action_trusted_flagger).toBe(
      after.median_hours_to_action_trusted_flagger,
    )
    expect(afterRestore.actions_on_law_count).toBe(after.actions_on_law_count)
  }, 240_000)

  it('counts durable automated assessment provenance rather than nullable staff identity', async () => {
    if (getIsolatedDatabaseCaseMode('copyright-dsa-notice-automation') === 'parent') {
      await runIsolatedDatabaseCase('copyright-dsa-notice-automation')
      return
    }
    const { start, end } = period()
    const before = await readDsaCopyrightNoticeFigures(start, end)
    const { notice, screeningId } = await createClearScreenedForm(2)
    const assessment = await appendCopyrightSubmissionAssessment({
      submissionId: notice.intake.copyright_notice_submission_id,
      assessedAt: new Date(),
      currentUser: null,
      substantiallyCompliant: true,
      copyrightFormScreeningId: screeningId,
    })
    const [targetId] = await readCopyrightNoticeTargetIds(notice.intake.copyright_notice_id)
    if (!targetId) throw new Error('Screened notice target missing')
    await acceptCopyrightNoticeAndImposeRestriction({
      noticeId: notice.intake.copyright_notice_id,
      targetId,
      assessmentId: assessment.id,
      imposedAt: new Date(),
      imposedById: null,
    })
    const after = await readDsaCopyrightNoticeFigures(start, end)
    expect(
      after.notices_processed_by_automated_means_count -
        before.notices_processed_by_automated_means_count,
    ).toBe(1)
    expect(
      after.restrictions_imposed_by_automated_means_count -
        before.restrictions_imposed_by_automated_means_count,
    ).toBe(1)
    expect(after.actions_on_law_count - before.actions_on_law_count).toBe(1)
    expect(after.notified_items_count - before.notified_items_count).toBe(2)
  }, 240_000)

  it('counts guidance-only processing while leaving the human restriction out of automated actions', async () => {
    if (getIsolatedDatabaseCaseMode('copyright-dsa-notice-guidance') === 'parent') {
      await runIsolatedDatabaseCase('copyright-dsa-notice-guidance')
      return
    }
    const { start, end } = period()
    const restricted = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const before = await readDsaCopyrightNoticeFigures(start, end)
    const hold = await appendCopyrightNoticeSubmission({
      noticeId: restricted.noticeId,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date(),
      sourceKind: 'staff',
      submittedByUserId: null,
      bodyCiphertext: `filing-${crypto.randomUUID()}`,
    })
    const guidance: CopyrightLegalHoldGuidance = {
      summary: 'The filing needs human review.',
      criteria: COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA.map(criterion => ({
        criterion,
        status: 'unclear' as const,
        gap: 'Check the court filing.',
      })),
      risk_notes: [],
    }
    await appendCopyrightSubmissionGuidance({
      submissionId: hold.id,
      inputSha256: Buffer.alloc(32, 72),
      promptVersion: 'test-dsa-report-guidance-v1',
      model: 'test-model',
      guidance,
    })
    const after = await readDsaCopyrightNoticeFigures(start, end)
    expect(
      after.notices_processed_by_automated_means_count -
        before.notices_processed_by_automated_means_count,
    ).toBe(1)
    expect(after.restrictions_imposed_by_automated_means_count).toBe(
      before.restrictions_imposed_by_automated_means_count,
    )
  }, 240_000)

  it('includes a court-hold reimposition as a separate law action', async () => {
    if (getIsolatedDatabaseCaseMode('copyright-dsa-notice-hold') === 'parent') {
      await runIsolatedDatabaseCase('copyright-dsa-notice-hold')
      return
    }
    const dependencies = createTestCopyrightDeliveryDependencies(async () => undefined)
    const scene = await openHeldCounterNoticeRestore(dependencies)
    await expect(
      processCopyrightActionIntent(scene.restore.id, scene.restorationAt, dependencies),
    ).resolves.toBe('applied')
    const { start, end } = period()
    const before = await readDsaCopyrightNoticeFigures(start, end)
    await recordOrdinaryCopyrightHold(scene, dependencies.prepublishImagePlacementDenial)
    const after = await readDsaCopyrightNoticeFigures(start, end)
    expect(after.actions_on_law_count - before.actions_on_law_count).toBe(1)
    expect(after.actions_on_terms_count).toBe(0)
    expect((await getCopyrightNoticePrivateAggregate(scene.notice.id))?.restrictions).toHaveLength(
      2,
    )
  }, 240_000)

  it('rounds receipt-to-completed-withhold time from one notice to two hours decimals', async () => {
    if (getIsolatedDatabaseCaseMode('copyright-dsa-notice-median') === 'parent') {
      await runIsolatedDatabaseCase('copyright-dsa-notice-median')
      return
    }
    const imposedAt = new Date(Date.now() - 2 * 3_600_000)
    const receivedAt = new Date(imposedAt.getTime() - 3_600_000)
    const completedAt = new Date(receivedAt.getTime() + 74 * 60_000 + 24_000)
    const start = new Date(imposedAt.getTime() - 1_000)
    const end = new Date(imposedAt.getTime() + 1_000)
    const before = await readDsaCopyrightNoticeFigures(start, end)
    await createTestTimedDsaReportAction({ receivedAt, imposedAt, completedAt })
    const after = await readDsaCopyrightNoticeFigures(start, end)
    expect(after.actions_on_law_count - before.actions_on_law_count).toBe(1)
    expect(after.median_hours_to_action).toBe(1.24)
  }, 240_000)
})
