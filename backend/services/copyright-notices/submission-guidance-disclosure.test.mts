import { addDisclosureCounterGuidance } from '@voucha/test-helpers/copyright-disclosure-guidance'
import { seedRestorationCounterNotice } from '@voucha/test-helpers/copyright-restoration-counter-notice-fixture'
import { appendTestCopyrightNoticeSubmission } from '@voucha/test-helpers/copyright-notice-submissions'
import { describe, expect, it } from 'vitest'
import { listNotifications } from '@services/notifications'
import { seedDisclosureCounterReview } from '@voucha/test-helpers/copyright-disclosure-review-fixtures'
import { assertDisclosureCounterReview } from '@voucha/test-helpers/copyright-disclosure-counter-review-subject'
import { createCommittedDisclosureEmailCounter } from '@voucha/test-helpers/copyright-disclosure-email-scenes'
import { createCommittedDisclosureInAppScene } from '@voucha/test-helpers/copyright-disclosure-in-app-scenes'
import { appendCopyrightSubmissionGuidance } from './submission-guidance.mts'
import { copyrightNotificationCopy } from './statement-of-reasons-wording.mts'
import {
  assertStatementInAppTransport,
  assertStatementEmailTransport,
} from '@voucha/test-helpers/copyright-statement-transport-subjects'
import { getDisclosureIntent } from '@voucha/test-helpers/copyright-disclosure-intent-read'
import {
  readTestCopyrightStatementFacts,
  readTestCopyrightStatementIntents,
} from '@voucha/test-helpers/copyright-statement-notices'
import {
  COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA,
  type CopyrightLegalHoldGuidance,
} from '@ts-shared/utils/copyright-submission-guidance'
import {
  createTestSubmissionGuidanceCounterCase,
  createTestSubmissionGuidanceRestorationStatement,
} from '@voucha/test-helpers/copyright-submission-guidance-disclosure-fixtures'

const assisted = 'Automated tools assisted with processing this case.'
const didNotAssist = 'Automated tools did not assist with processing this case.'
const holdGuidance: CopyrightLegalHoldGuidance = {
  summary: 'The filing identifies the proceeding and material.',
  criteria: COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA.map(criterion => ({
    criterion,
    status: 'present' as const,
    gap: null,
  })),
  risk_notes: [],
}
async function createCounter(
  caseFixture: Awaited<ReturnType<typeof createTestSubmissionGuidanceCounterCase>>,
) {
  return seedRestorationCounterNotice(caseFixture.poster, caseFixture.noticeId, [
    caseFixture.target.id,
  ])
}

describe('copyright submission guidance disclosure', () => {
  it.each([true, false])(
    'commits the actual guided counter review atomically: accepted=%s',
    async isAccepted => {
      expect.hasAssertions()
      const scene = await createTestSubmissionGuidanceCounterCase({
        claimantEmail: `claimant-${crypto.randomUUID()}@example.test`,
      })
      const counter = await createCounter(scene)
      await addDisclosureCounterGuidance(counter.submission.id, 10)
      await assertDisclosureCounterReview(
        {
          submissionId: counter.submission.id,
          currentUser: scene.moderator,
          is_accepted: isAccepted,
          rationale: 'The declarations were reviewed.',
        },
        { noticeId: scene.noticeId, targetId: scene.target.id, poster: scene.poster },
      )
    },
  )

  it('adds the shared sentence to accepted email outcome and forwarded counter-notice only when guidance existed at review', async () => {
    const guided = await createCommittedDisclosureEmailCounter()
    await addDisclosureCounterGuidance(guided.submissionId, 11)
    await seedDisclosureCounterReview({
      submissionId: guided.submissionId,
      currentUser: guided.moderator,
      is_accepted: true,
      rationale: 'The declarations are complete.',
    })
    const outcome = await getDisclosureIntent(
      guided.noticeId,
      guided.submissionId,
      'status_update',
      'email',
    )
    const forwarding = await getDisclosureIntent(
      guided.noticeId,
      guided.submissionId,
      'counter_notice_forwarding',
      'email',
    )
    expect((await assertStatementEmailTransport(outcome.id)).text.endsWith(assisted)).toBe(true)
    expect((await assertStatementEmailTransport(forwarding.id)).text.endsWith(assisted)).toBe(true)

    const plain = await createCommittedDisclosureEmailCounter()
    await seedDisclosureCounterReview({
      submissionId: plain.submissionId,
      currentUser: plain.moderator,
      is_accepted: true,
      rationale: 'The declarations are complete.',
    })
    const plainOutcome = await getDisclosureIntent(
      plain.noticeId,
      plain.submissionId,
      'status_update',
      'email',
    )
    const plainForwarding = await getDisclosureIntent(
      plain.noticeId,
      plain.submissionId,
      'counter_notice_forwarding',
      'email',
    )
    expect((await assertStatementEmailTransport(plainOutcome.id)).text).not.toContain(assisted)
    expect((await assertStatementEmailTransport(plainForwarding.id)).text).not.toContain(assisted)
  })

  it('discloses guidance in rejected email outcomes and ignores guidance added after a review', async () => {
    const rejected = await createCommittedDisclosureEmailCounter()
    await addDisclosureCounterGuidance(rejected.submissionId, 12)
    await seedDisclosureCounterReview({
      submissionId: rejected.submissionId,
      currentUser: rejected.moderator,
      is_accepted: false,
      rationale: 'The declarations need review.',
    })
    const rejectedOutcome = await getDisclosureIntent(
      rejected.noticeId,
      rejected.submissionId,
      'status_update',
      'email',
    )
    expect((await assertStatementEmailTransport(rejectedOutcome.id)).text.endsWith(assisted)).toBe(
      true,
    )

    const late = await createCommittedDisclosureEmailCounter()
    await seedDisclosureCounterReview({
      submissionId: late.submissionId,
      currentUser: late.moderator,
      is_accepted: true,
      rationale: 'The declarations are complete.',
    })
    await addDisclosureCounterGuidance(late.submissionId, 13)
    const lateOutcome = await getDisclosureIntent(
      late.noticeId,
      late.submissionId,
      'status_update',
      'email',
    )
    const lateForwarding = await getDisclosureIntent(
      late.noticeId,
      late.submissionId,
      'counter_notice_forwarding',
      'email',
    )
    expect((await assertStatementEmailTransport(lateOutcome.id)).text).not.toContain(assisted)
    expect((await assertStatementEmailTransport(lateForwarding.id)).text).not.toContain(assisted)
  })

  it('adds disclosure to decision in-app updates, never to filing receipts, including late guidance', async () => {
    const fixture = await createTestSubmissionGuidanceCounterCase()
    const counter = await createCounter(fixture)
    const receipt = await getDisclosureIntent(
      fixture.noticeId,
      counter.submission.id,
      'status_update',
      'in_app',
      true,
    )
    await addDisclosureCounterGuidance(counter.submission.id, 14)
    await assertStatementInAppTransport(receipt.id)
    const receiptScene = await createCommittedDisclosureInAppScene('receipt', id =>
      addDisclosureCounterGuidance(id, 14),
    )
    const receiptNotifications = await listNotifications(receiptScene.fixture.actorUserId)
    const receiptNotification = Object.values(receiptNotifications.notifications).find(
      notification => notification.event_key === `copyright-delivery:${receiptScene.intent.id}`,
    )
    expect(receiptNotification).toBeDefined()
    expect(receiptNotification?.body).toBe(copyrightNotificationCopy('status_update').body)
    expect(receiptNotification?.body).not.toContain(assisted)

    await seedDisclosureCounterReview({
      submissionId: counter.submission.id,
      currentUser: fixture.moderator,
      is_accepted: false,
      rationale: 'The declarations need review.',
    })
    const decision = await getDisclosureIntent(
      fixture.noticeId,
      counter.submission.id,
      'status_update',
      'in_app',
      true,
    )
    await assertStatementInAppTransport(decision.id)
    const decisionScene = await createCommittedDisclosureInAppScene('decision', id =>
      addDisclosureCounterGuidance(id, 14),
    )
    const decisionNotifications = await listNotifications(decisionScene.fixture.actorUserId)
    const decisionNotification = Object.values(decisionNotifications.notifications).find(
      notification => notification.event_key === `copyright-delivery:${decisionScene.intent.id}`,
    )
    expect(decisionNotification?.body).toContain(assisted)

    const lateFixture = await createTestSubmissionGuidanceCounterCase()
    const lateCounter = await createCounter(lateFixture)
    await seedDisclosureCounterReview({
      submissionId: lateCounter.submission.id,
      currentUser: lateFixture.moderator,
      is_accepted: false,
      rationale: 'The declarations need review.',
    })
    await addDisclosureCounterGuidance(lateCounter.submission.id, 15)
    const lateDecision = await getDisclosureIntent(
      lateFixture.noticeId,
      lateCounter.submission.id,
      'status_update',
      'in_app',
      true,
    )
    await assertStatementInAppTransport(lateDecision.id)
    const lateScene = await createCommittedDisclosureInAppScene('late', id =>
      addDisclosureCounterGuidance(id, 15),
    )
    const lateNotifications = await listNotifications(lateScene.fixture.actorUserId)
    const lateNotification = Object.values(lateNotifications.notifications).find(
      notification => notification.event_key === `copyright-delivery:${lateScene.intent.id}`,
    )
    expect(lateNotification).toBeDefined()
    expect(lateNotification?.body).toBe(copyrightNotificationCopy('status_update').body)
    expect(lateNotification?.body).not.toContain(assisted)
  })

  it('feeds counter-notice and hold guidance into actual restoration statements and leaves unassisted cases clear', async () => {
    const counterCase = await createTestSubmissionGuidanceCounterCase()
    const counter = await createCounter(counterCase)
    await addDisclosureCounterGuidance(counter.submission.id, 16)
    expect((await readTestCopyrightStatementFacts(counterCase.noticeId)).aiGuidance).toBe(true)
    await createTestSubmissionGuidanceRestorationStatement({
      noticeId: counterCase.noticeId,
      targetId: counterCase.target.id,
      restrictionId: counterCase.restriction.id,
      cause: 'counter_notice_window',
    })
    const counterStatement = (await readTestCopyrightStatementIntents(counterCase.noticeId)).find(
      intent => intent.delivery_kind === 'poster_restoration_notice',
    )
    expect(counterStatement?.text).toContain(assisted)

    const holdCase = await createTestSubmissionGuidanceCounterCase()
    const hold = await appendTestCopyrightNoticeSubmission({
      noticeId: holdCase.noticeId,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date(),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `hold-${crypto.randomUUID()}`,
    })
    await appendCopyrightSubmissionGuidance({
      submissionId: hold.id,
      inputSha256: Buffer.alloc(32, 17),
      promptVersion: 'test-copyright-submission-guidance-v1',
      model: 'test-model',
      guidance: holdGuidance,
    })
    expect((await readTestCopyrightStatementFacts(holdCase.noticeId)).aiGuidance).toBe(true)
    await createTestSubmissionGuidanceRestorationStatement({
      noticeId: holdCase.noticeId,
      targetId: holdCase.target.id,
      restrictionId: holdCase.restriction.id,
      cause: 'hold_resolved',
    })
    const holdStatement = (await readTestCopyrightStatementIntents(holdCase.noticeId)).find(
      intent => intent.delivery_kind === 'poster_restoration_notice',
    )
    expect(holdStatement?.text).toContain(assisted)

    const plainCase = await createTestSubmissionGuidanceCounterCase()
    expect((await readTestCopyrightStatementFacts(plainCase.noticeId)).aiGuidance).toBe(false)
    await createTestSubmissionGuidanceRestorationStatement({
      noticeId: plainCase.noticeId,
      targetId: plainCase.target.id,
      restrictionId: plainCase.restriction.id,
      cause: 'hold_resolved',
    })
    const plainStatement = (await readTestCopyrightStatementIntents(plainCase.noticeId)).find(
      intent => intent.delivery_kind === 'poster_restoration_notice',
    )
    expect(plainStatement?.text).toContain(didNotAssist)
  })
})
