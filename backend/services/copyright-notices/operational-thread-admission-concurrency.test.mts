import { createTestUser } from '@voucha/test-helpers'
import { placeUserPreservationHold } from '../users/preservation-holds.mts'
import { describe, expect, it } from 'vitest'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import { positionCopyrightOperationalCursor } from '@voucha/test-helpers/copyright-operational-retention'
import {
  linkTestCopyrightEmailIntake,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { linkCopyrightEmailIntakeToNotice } from '@voucha/test-helpers/copyright-email-intake-link'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import {
  admitCopyrightEmailDuringThreadProof,
  holdCopyrightCaseBeforeThreadEligibility,
} from '@voucha/test-helpers/copyright-thread-sweep-admission-race'
import { sweepCopyrightCaseThreads } from './operational-retention-threading.mts'

const day = 24 * 60 * 60 * 1000

describe('copyright thread proof and correspondence admission', () => {
  useCopyrightOperationalCursorReservation()
  it('keeps the committed review and its source when admission overlaps the blocker proof', async () => {
    const notice = await createRetentionMinimalCase()
    const initial = await createRetentionParsedEmail('proof-race-initial', {
      sesMessageId: notice.initialEmailSesMessageId,
    })
    const reply = await createRetentionParsedEmail('proof-race-reply', { reply: true })
    await linkTestCopyrightEmailIntake(initial.id, notice.noticeId)
    await linkCopyrightEmailIntakeToNotice({
      noticeId: notice.noticeId,
      intakeId: reply.id,
      linkKind: 'thread',
    })
    const before = await readCopyrightThreadReferenceState(reply.id)
    await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
    const result = await admitCopyrightEmailDuringThreadProof(
      {
        currentUser: notice.moderator,
        intakeId: reply.id,
        kind: 'supplement',
        targetIds: [],
        structuredSubmission: { summary: 'Reviewed supplemental evidence.' },
        rationale: 'Confirmed supplemental evidence.',
        recommendationId: null,
        manualFallbackReason: 'Agent unavailable.',
      },
      notice.noticeId,
      () =>
        sweepCopyrightCaseThreads({
          now: new Date(Date.now() + 181 * day),
          replyDays: 180,
          batchSize: 10,
          maxBatches: 5,
        }),
    )
    expect(result.admission).toMatchObject({ noticeId: notice.noticeId, isDuplicate: false })
    expect(await readCopyrightThreadReferenceState(reply.id)).toEqual(before)
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.noticeId)
    expect(aggregate?.emailCorrespondenceReviews).toEqual([
      expect.objectContaining({ action: 'admitted', copyright_notice_email_intake_id: reply.id }),
    ])
    expect(aggregate?.submissions.filter(row => row.kind === 'supplement')).toHaveLength(1)
  })
  it('retains thread evidence when an account hold commits after the completed generation proofs', async () => {
    const admin = await createTestUser({ administrator: true })
    const notice = await createRetentionMinimalCase()
    const initial = await createRetentionParsedEmail('proof-hold-initial', {
      sesMessageId: notice.initialEmailSesMessageId,
    })
    const reply = await createRetentionParsedEmail('proof-hold-reply', { reply: true })
    await linkTestCopyrightEmailIntake(initial.id, notice.noticeId)
    await linkTestCopyrightEmailIntake(reply.id, notice.noticeId, 'thread', notice.moderator.id)
    const before = await readCopyrightThreadReferenceState(reply.id)
    await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
    const result = await holdCopyrightCaseBeforeThreadEligibility(
      notice.noticeId,
      () => placeUserPreservationHold(admin, notice.posterId, 'hold-before-thread-retirement'),
      () =>
        sweepCopyrightCaseThreads({
          now: new Date(Date.now() + 181 * day),
          replyDays: 180,
          batchSize: 10,
          maxBatches: 100,
        }),
    )
    expect(result.deleted).toBe(0)
    expect(await readCopyrightThreadReferenceState(reply.id)).toEqual(before)
  })
})
