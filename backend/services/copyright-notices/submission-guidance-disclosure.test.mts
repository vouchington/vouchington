import { describe, expect, it } from 'vitest'
import { listNotifications } from '@services/notifications'
import { appendCopyrightNoticeSubmission } from './submission-appending.mts'
import { createCopyrightCounterNotice, reviewCopyrightCounterNotice } from './index.mts'
import { copyrightSubmissionGuidance } from './submission-guidance.mts'
import { copyrightNotificationCopy } from './statement-of-reasons-wording.mts'
import {
  deliverCopyrightInAppNotification,
  prepareCopyrightEmailDelivery,
} from './delivery-transport.mts'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  readTestCopyrightStatementFacts,
  readTestCopyrightStatementIntents,
} from '@voucha/test-helpers/copyright-statement-notices'
import {
  COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS,
  COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA,
  type CopyrightCounterNoticeGuidance,
  type CopyrightLegalHoldGuidance,
} from '@ts-shared/utils/copyright-submission-guidance'
import {
  admitTestSubmissionGuidanceEmailCounter,
  createTestSubmissionGuidanceCounterCase,
  createTestSubmissionGuidanceRestorationStatement,
} from '@voucha/test-helpers/copyright-submission-guidance-disclosure-fixtures'

const assisted = 'Automated tools assisted with processing this case.'
const didNotAssist = 'Automated tools did not assist with processing this case.'
const counterGuidance: CopyrightCounterNoticeGuidance = {
  summary: 'The required declarations are present.',
  elements: COPYRIGHT_COUNTER_NOTICE_GUIDANCE_ELEMENTS.map(element => ({
    element,
    status: 'present' as const,
    gap: null,
  })),
  risk_notes: [],
}
const holdGuidance: CopyrightLegalHoldGuidance = {
  summary: 'The filing identifies the proceeding and material.',
  criteria: COPYRIGHT_LEGAL_HOLD_GUIDANCE_CRITERIA.map(criterion => ({
    criterion,
    status: 'present' as const,
    gap: null,
  })),
  risk_notes: [],
}
async function addCounterGuidance(submissionId: string, seed: number): Promise<void> {
  await copyrightSubmissionGuidance.append({
    submissionId,
    inputSha256: Buffer.alloc(32, seed),
    promptVersion: 'test-copyright-submission-guidance-v1',
    model: 'test-model',
    guidance: counterGuidance,
  })
}
async function createCounter(
  caseFixture: Awaited<ReturnType<typeof createTestSubmissionGuidanceCounterCase>>,
) {
  return createCopyrightCounterNotice(
    caseFixture.poster,
    caseFixture.noticeId,
    crypto.randomUUID(),
    {
      name: 'Poster',
      address: '1 Main Street',
      telephone: '555-0100',
      consentToFederalJurisdiction: true,
      consentToServiceOfProcess: true,
      goodFaithMisidentificationUnderPenaltyOfPerjury: true,
      electronicSignature: 'Poster',
      targetIds: [caseFixture.target.id],
    },
  )
}
async function getIntent(
  noticeId: string,
  submissionId: string,
  deliveryKind: string,
  channel: string,
  latest = false,
) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const matching =
    aggregate?.deliveryIntents.filter(
      row =>
        row.copyright_notice_submission_id === submissionId &&
        row.delivery_kind === deliveryKind &&
        row.channel === channel,
    ) ?? []
  const intent = latest ? matching.at(-1) : matching[0]
  if (!intent) throw new Error(`Missing ${deliveryKind} ${channel} intent`)
  return intent
}

describe('copyright submission guidance disclosure', () => {
  it('adds the shared sentence to accepted email outcome and forwarded counter-notice only when guidance existed at review', async () => {
    const guided = await admitTestSubmissionGuidanceEmailCounter()
    await addCounterGuidance(guided.submissionId, 11)
    await reviewCopyrightCounterNotice({
      submissionId: guided.submissionId,
      currentUser: guided.moderator,
      accepted: true,
      rationale: 'The declarations are complete.',
    })
    const outcome = await getIntent(guided.noticeId, guided.submissionId, 'status_update', 'email')
    const forwarding = await getIntent(
      guided.noticeId,
      guided.submissionId,
      'counter_notice_forwarding',
      'email',
    )
    expect((await prepareCopyrightEmailDelivery(outcome.id)).text.endsWith(assisted)).toBe(true)
    expect((await prepareCopyrightEmailDelivery(forwarding.id)).text.endsWith(assisted)).toBe(true)

    const plain = await admitTestSubmissionGuidanceEmailCounter()
    await reviewCopyrightCounterNotice({
      submissionId: plain.submissionId,
      currentUser: plain.moderator,
      accepted: true,
      rationale: 'The declarations are complete.',
    })
    const plainOutcome = await getIntent(
      plain.noticeId,
      plain.submissionId,
      'status_update',
      'email',
    )
    const plainForwarding = await getIntent(
      plain.noticeId,
      plain.submissionId,
      'counter_notice_forwarding',
      'email',
    )
    expect((await prepareCopyrightEmailDelivery(plainOutcome.id)).text).not.toContain(assisted)
    expect((await prepareCopyrightEmailDelivery(plainForwarding.id)).text).not.toContain(assisted)
  })

  it('discloses guidance in rejected email outcomes and ignores guidance added after a review', async () => {
    const rejected = await admitTestSubmissionGuidanceEmailCounter()
    await addCounterGuidance(rejected.submissionId, 12)
    await reviewCopyrightCounterNotice({
      submissionId: rejected.submissionId,
      currentUser: rejected.moderator,
      accepted: false,
      rationale: 'The declarations need review.',
    })
    const rejectedOutcome = await getIntent(
      rejected.noticeId,
      rejected.submissionId,
      'status_update',
      'email',
    )
    expect((await prepareCopyrightEmailDelivery(rejectedOutcome.id)).text.endsWith(assisted)).toBe(
      true,
    )

    const late = await admitTestSubmissionGuidanceEmailCounter()
    await reviewCopyrightCounterNotice({
      submissionId: late.submissionId,
      currentUser: late.moderator,
      accepted: true,
      rationale: 'The declarations are complete.',
    })
    await addCounterGuidance(late.submissionId, 13)
    const lateOutcome = await getIntent(late.noticeId, late.submissionId, 'status_update', 'email')
    const lateForwarding = await getIntent(
      late.noticeId,
      late.submissionId,
      'counter_notice_forwarding',
      'email',
    )
    expect((await prepareCopyrightEmailDelivery(lateOutcome.id)).text).not.toContain(assisted)
    expect((await prepareCopyrightEmailDelivery(lateForwarding.id)).text).not.toContain(assisted)
  })

  it('adds disclosure to decision in-app updates, never to filing receipts, including late guidance', async () => {
    const fixture = await createTestSubmissionGuidanceCounterCase()
    const counter = await createCounter(fixture)
    const receipt = await getIntent(
      fixture.noticeId,
      counter.submission.id,
      'status_update',
      'in_app',
      true,
    )
    await addCounterGuidance(counter.submission.id, 14)
    await deliverCopyrightInAppNotification(receipt.id)
    const receiptNotifications = await listNotifications(fixture.fixture.actorUserId)
    const receiptNotification = Object.values(receiptNotifications.notifications).find(
      notification => notification.event_key === `copyright-delivery:${receipt.id}`,
    )
    expect(receiptNotification).toBeDefined()
    expect(receiptNotification?.body).toBe(copyrightNotificationCopy('status_update').body)
    expect(receiptNotification?.body).not.toContain(assisted)

    await reviewCopyrightCounterNotice({
      submissionId: counter.submission.id,
      currentUser: fixture.moderator,
      accepted: false,
      rationale: 'The declarations need review.',
    })
    const decision = await getIntent(
      fixture.noticeId,
      counter.submission.id,
      'status_update',
      'in_app',
      true,
    )
    await deliverCopyrightInAppNotification(decision.id)
    const decisionNotifications = await listNotifications(fixture.fixture.actorUserId)
    const decisionNotification = Object.values(decisionNotifications.notifications).find(
      notification => notification.event_key === `copyright-delivery:${decision.id}`,
    )
    expect(decisionNotification?.body).toContain(assisted)

    const lateFixture = await createTestSubmissionGuidanceCounterCase()
    const lateCounter = await createCounter(lateFixture)
    await reviewCopyrightCounterNotice({
      submissionId: lateCounter.submission.id,
      currentUser: lateFixture.moderator,
      accepted: false,
      rationale: 'The declarations need review.',
    })
    await addCounterGuidance(lateCounter.submission.id, 15)
    const lateDecision = await getIntent(
      lateFixture.noticeId,
      lateCounter.submission.id,
      'status_update',
      'in_app',
      true,
    )
    await deliverCopyrightInAppNotification(lateDecision.id)
    const lateNotifications = await listNotifications(lateFixture.fixture.actorUserId)
    const lateNotification = Object.values(lateNotifications.notifications).find(
      notification => notification.event_key === `copyright-delivery:${lateDecision.id}`,
    )
    expect(lateNotification).toBeDefined()
    expect(lateNotification?.body).toBe(copyrightNotificationCopy('status_update').body)
    expect(lateNotification?.body).not.toContain(assisted)
  })

  it('feeds counter-notice and hold guidance into actual restoration statements and leaves unassisted cases clear', async () => {
    const counterCase = await createTestSubmissionGuidanceCounterCase()
    const counter = await createCounter(counterCase)
    await addCounterGuidance(counter.submission.id, 16)
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
    const hold = await appendCopyrightNoticeSubmission({
      noticeId: holdCase.noticeId,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date(),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `hold-${crypto.randomUUID()}`,
    })
    await copyrightSubmissionGuidance.append({
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
