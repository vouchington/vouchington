import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { deleteTestUser } from '@voucha/test-helpers/data-stores/psql/moderation-admission-relations'
import { createTestTimedDsaReportAction } from '@voucha/test-helpers/dsa-report-timed-action'
import {
  COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA,
  type CopyrightLegalHoldGuidance,
} from '@ts-shared/utils/copyright-submission-guidance'
import { seedDsaProjectionDecision } from '@voucha/test-helpers/copyright-dsa-projection-prerequisites'
import {
  seedDsaAutomatedReportingTarget,
  seedDsaReportingWithhold,
} from '@voucha/test-helpers/copyright-dsa-reporting-prerequisites'
import { seedCompletedReversalStatement } from '@voucha/test-helpers/copyright-restored-statement-fixture'
import {
  seedCompletedStatutoryContract,
  seedStatutoryContractHold,
} from '@voucha/test-helpers/copyright-statutory-contract-fixtures'
import {
  seedCommittedTerritorialRedress,
  seedCommittedTerritorialRedressDecision,
} from '@voucha/test-helpers/copyright-territorial-committed-redress'
import { appendCopyrightSubmissionGuidance } from './submission-guidance.mts'
import { openHeldCounterNoticeRestore } from '@voucha/test-helpers/copyright-restoration-hold-scene'
import { readDsaCopyrightNoticeFigures } from './eu-reporting-notices.mts'

const period = () => ({
  start: new Date(Date.now() - 86_400_000),
  end: new Date(Date.now() + 86_400_000),
})

describe('DSA copyright notice aggregates', () => {
  useCopyrightIntakeEnvironment()
  beforeEach(() => {
    installTestMediaDeliveryEdge()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('omits medians when no completed withhold qualifies', async () => {
    const empty = await readDsaCopyrightNoticeFigures(
      new Date('2200-01-01T00:00:00.000Z'),
      new Date('2200-01-02T00:00:00.000Z'),
      [crypto.randomUUID()],
    )
    expect(empty).not.toHaveProperty('median_hours_to_action')
    expect(empty).not.toHaveProperty('median_hours_to_action_trusted_flagger')
    expect(empty.actions_on_terms_count).toBe(0)
  })

  it('counts every pipeline but only in-area flaggers for trusted figures', async () => {
    const { start, end } = period()
    const us = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const inArea = await createTestReportingTrustedEuCase('intellectual_property', 'restrict')
    const outOfArea = await createTestReportingTrustedEuCase('other', 'no_action')
    const uk = await createTestTerritorialRestrictionScene('uk')
    const foreign = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const ownedIds = [us.noticeId, inArea.noticeId, outOfArea.noticeId, uk.noticeId]
    await seedDsaProjectionDecision('uk', uk.staff, uk.noticeId, {
      text: 'The identified image reproduces the protected photograph.',
      publicExplanation: 'The hosted image matches the notified work.',
      outcome: 'restrict',
      targets: uk.targets,
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(inArea.noticeId)
    const withhold = aggregate?.actionIntents.find(intent => intent.action === 'withhold')
    if (!withhold) throw new Error('EU restriction did not create a withhold intent')
    await seedDsaReportingWithhold(inArea.noticeId, withhold.id)
    const after = await readDsaCopyrightNoticeFigures(start, end, ownedIds)
    expect(ownedIds).not.toContain(foreign.noticeId)
    expect(after.notices_received_count).toBe(4)
    expect(after.notified_items_count).toBe(4)
    expect(after.notices_received_trusted_flagger_count).toBe(1)
    expect(after.notified_items_trusted_flagger_count).toBe(1)
    expect(after.actions_on_law_count).toBe(3)
    expect(after.actions_on_law_trusted_flagger_count).toBe(1)
    expect(after.actions_on_terms_count).toBe(0)
    expect(after.actions_on_terms_trusted_flagger_count).toBe(0)
    expect(after.median_hours_to_action_trusted_flagger).toEqual(expect.any(Number))
    expect(JSON.stringify(after)).not.toContain(inArea.suffix)
    expect((await getCopyrightNoticePrivateAggregate(us.noticeId))?.restrictions).toHaveLength(1)
    await deleteTestUser(us.moderator.id)
    const afterErasure = await readDsaCopyrightNoticeFigures(start, end, ownedIds)
    expect(afterErasure.notices_processed_by_automated_means_count).toBe(
      after.notices_processed_by_automated_means_count,
    )
    expect(afterErasure.restrictions_imposed_by_automated_means_count).toBe(
      after.restrictions_imposed_by_automated_means_count,
    )
    const complaint = await seedCommittedTerritorialRedress(
      'eu_dsa',
      inArea.noticeId,
      inArea.claimant,
      'Please reverse this restriction.',
    )
    await seedCommittedTerritorialRedressDecision(
      'eu_dsa',
      inArea.noticeId,
      complaint.id,
      inArea.staff,
      {
        disposition: 'revoke',
        rationale: 'The reported material should be restored.',
      },
    )
    const restored = (
      await getCopyrightNoticePrivateAggregate(inArea.noticeId)
    )?.actionIntents.find(intent => intent.action === 'restore')
    if (!restored) throw new Error('EU reversal did not create a restore intent')
    await seedCompletedReversalStatement(restored.id)
    const afterRestore = await readDsaCopyrightNoticeFigures(start, end, ownedIds)
    expect(afterRestore.median_hours_to_action_trusted_flagger).toBe(
      after.median_hours_to_action_trusted_flagger,
    )
    expect(afterRestore.actions_on_law_count).toBe(after.actions_on_law_count)
  })

  it('counts durable automated assessment provenance rather than nullable staff identity', async () => {
    const { start, end } = period()
    const screened = await createClearScreenedForm(2)
    const noticeId = screened.notice.intake.copyright_notice_id
    await seedDsaAutomatedReportingTarget(screened)
    const foreign = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const after = await readDsaCopyrightNoticeFigures(start, end, [noticeId])
    expect(foreign.noticeId).not.toBe(noticeId)
    expect(after.notices_processed_by_automated_means_count).toBe(1)
    expect(after.restrictions_imposed_by_automated_means_count).toBe(1)
    expect(after.actions_on_law_count).toBe(1)
    expect(after.notified_items_count).toBe(2)
  })

  it('counts guidance-only processing while leaving the human restriction out of automated actions', async () => {
    const { start, end } = period()
    const restricted = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const foreign = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const ownedIds = [restricted.noticeId]
    expect(ownedIds).not.toContain(foreign.noticeId)
    const before = await readDsaCopyrightNoticeFigures(start, end, ownedIds)
    const hold = await appendTestCopyrightNoticeSubmission({
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
    const after = await readDsaCopyrightNoticeFigures(start, end, ownedIds)
    expect(
      after.notices_processed_by_automated_means_count -
        before.notices_processed_by_automated_means_count,
    ).toBe(1)
    expect(after.restrictions_imposed_by_automated_means_count).toBe(
      before.restrictions_imposed_by_automated_means_count,
    )
  })

  it('includes a court-hold reimposition as a separate law action', async () => {
    const scene = await openHeldCounterNoticeRestore()
    await seedCompletedStatutoryContract(scene)
    const { start, end } = period()
    const foreign = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const ownedIds = [scene.notice.id]
    expect(ownedIds).not.toContain(foreign.noticeId)
    const before = await readDsaCopyrightNoticeFigures(start, end, ownedIds)
    await seedStatutoryContractHold(scene)
    const after = await readDsaCopyrightNoticeFigures(start, end, ownedIds)
    expect(after.actions_on_law_count - before.actions_on_law_count).toBe(1)
    expect(after.actions_on_terms_count).toBe(0)
    expect((await getCopyrightNoticePrivateAggregate(scene.notice.id))?.restrictions).toHaveLength(
      2,
    )
  })

  it('rounds receipt-to-completed-withhold time from one notice to two hours decimals', async () => {
    const imposedAt = new Date(Date.now() - 2 * 3_600_000)
    const receivedAt = new Date(imposedAt.getTime() - 3_600_000)
    const completedAt = new Date(receivedAt.getTime() + 74 * 60_000 + 24_000)
    const start = new Date(Date.now() - 1_000)
    const end = new Date(Date.now() + 60_000)
    const noticeId = await createTestTimedDsaReportAction({ receivedAt, imposedAt, completedAt })
    const foreign = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
      imposedAt,
    )
    const after = await readDsaCopyrightNoticeFigures(start, end, [noticeId])
    expect(foreign.noticeId).not.toBe(noticeId)
    expect(after.actions_on_law_count).toBe(1)
    expect(after.median_hours_to_action).toBe(1.24)
  })
})
