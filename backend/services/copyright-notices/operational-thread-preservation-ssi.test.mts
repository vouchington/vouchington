import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { associateCopyrightEmailIntakeWithNotice } from './email-manual-association.mts'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  readCopyrightEmailManualAssociationEvent,
  readCopyrightEmailManualAssociationReview,
} from '@voucha/test-helpers/copyright-email-manual-association'
import { holdCopyrightCaseBeforeThreadEligibility } from '@voucha/test-helpers/copyright-thread-sweep-admission-race'
import {
  createCopyrightThreadMarkerScene,
  enterOwnedCopyrightThreadChildPhase,
  readOwnedCopyrightThreadChildren,
  readOwnedCopyrightCaseHoldHistory,
} from '@voucha/test-helpers/copyright-thread-preservation-fixture'
import {
  placeCopyrightCasePreservationHold,
  releaseCopyrightCasePreservationHold,
} from './retention-review-closures.mts'
import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import { positionCopyrightOperationalCursor } from '@voucha/test-helpers/copyright-operational-retention'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import {
  seedCopyrightThreadRetirement,
  seedTestCopyrightAncestorEdge,
  linkTestCopyrightEmailIntake,
  readCopyrightThreadReferenceState,
} from '@voucha/test-helpers/copyright-operational-email-retention'
import {
  assessAfterMixedCopyrightRetirementRead,
  afterCopyrightHoldCoverage,
  afterCopyrightThreadRetirementRead,
} from '@voucha/test-helpers/copyright-preservation-coverage-interleave'
import {
  releaseUserPreservationHold,
  placeUserPreservationHold,
  getUserPreservationHoldState,
} from '../users/preservation-holds.mts'
import { sweepCopyrightCaseThreads } from './operational-retention-threading.mts'

const day = 24 * 60 * 60 * 1000

describe('copyright preservation transaction commit order', () => {
  useCopyrightOperationalCursorReservation()
  it.each(['account', 'case'] as const)(
    'rolls back the %s hold when retirement commits after its coverage read',
    async kind => {
      const admin = await createTestUser({ administrator: true })
      const notice = await createRetentionMinimalCase()
      const initial = await createRetentionParsedEmail('hold-ssi-initial', {
        sesMessageId: notice.initialEmailSesMessageId,
      })
      const reply = await createRetentionParsedEmail('hold-ssi-reply', { reply: true })
      await linkTestCopyrightEmailIntake(initial.id, notice.noticeId)
      await linkTestCopyrightEmailIntake(reply.id, notice.noticeId, 'thread', notice.moderator.id)
      expect((await readCopyrightThreadReferenceState(reply.id)).referenceCount).toBeGreaterThan(0)
      await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
      await enterOwnedCopyrightThreadChildPhase(notice.noticeId, reply.id, 'references', false)
      await expect(
        afterCopyrightHoldCoverage(
          notice.noticeId,
          async () => {
            const retired = await sweepCopyrightCaseThreads({
              now: new Date(Date.now() + 181 * day),
              replyDays: 180,
              batchSize: 10,
              maxBatches: 100,
            })
            expect(retired.deleted).toBeGreaterThan(0)
          },
          () =>
            kind === 'account'
              ? placeUserPreservationHold(admin, notice.posterId, 'native-retirement-conflict')
              : placeCopyrightCasePreservationHold(
                  notice.moderator,
                  notice.noticeId,
                  'litigation_threat',
                ),
        ),
      ).rejects.toMatchObject({ status: 409, code: 'CONFLICT', cause: { code: '40001' } })
      expect((await getUserPreservationHoldState(admin, notice.posterId)).holds).toEqual([])
      expect(await readOwnedCopyrightCaseHoldHistory(notice.noticeId)).toEqual([])
      expect(await readCopyrightThreadReferenceState(reply.id)).toEqual({
        tokenId: null,
        referenceCount: 0,
      })
    },
  )
  it.each(['matched_token', 'reply_edges', 'ancestor_edges'] as const)(
    'retains %s when the account hold commits first',
    async family => {
      const admin = await createTestUser({ administrator: true })
      const notice = await createRetentionMinimalCase()
      const initial = await createRetentionParsedEmail('hold-family-initial', {
        sesMessageId: notice.initialEmailSesMessageId,
      })
      const reply = await createRetentionParsedEmail('hold-family-reply', { reply: true })
      const token = (await readCopyrightThreadReferenceState(reply.id)).tokenId!
      await linkTestCopyrightEmailIntake(initial.id, notice.noticeId)
      await linkTestCopyrightEmailIntake(
        reply.id,
        notice.noticeId,
        'thread',
        notice.moderator.id,
        family === 'matched_token' ? token : undefined,
      )
      if (family !== 'matched_token') await seedTestCopyrightAncestorEdge(reply.id, initial.id)
      const target = family === 'ancestor_edges' ? initial.id : reply.id
      await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
      await enterOwnedCopyrightThreadChildPhase(
        notice.noticeId,
        target,
        family === 'matched_token' ? 'references' : family,
      )
      const before = await readOwnedCopyrightThreadChildren(target)
      expect({ matchedToken: before.matched_token_id, edges: before.edges }).toEqual({
        matchedToken: family === 'matched_token' ? token : null,
        edges: family === 'matched_token' ? 0 : 1,
      })
      const failures: unknown[] = []
      let held = false
      try {
        const result = await holdCopyrightCaseBeforeThreadEligibility(
          notice.noticeId,
          async () => {
            await placeUserPreservationHold(admin, notice.posterId, family)
            held = true
          },
          () =>
            sweepCopyrightCaseThreads({
              now: new Date(Date.now() + 181 * day),
              replyDays: 180,
              batchSize: 10,
              maxBatches: 100,
            }),
          err => failures.push(err),
        )
        expect(failures).toEqual([expect.objectContaining({ code: '40001' })])
        expect(result.deleted).toBe(0)
        expect(await readOwnedCopyrightThreadChildren(target)).toEqual(before)
      } finally {
        if (held) await releaseUserPreservationHold(admin, notice.posterId)
      }
    },
  )
  it('retains thread records when a case hold commits before admission', async () => {
    const notice = await createRetentionMinimalCase()
    const initial = await createRetentionParsedEmail('case-hold-initial', {
      sesMessageId: notice.initialEmailSesMessageId,
    })
    const reply = await createRetentionParsedEmail('case-hold-reply', { reply: true })
    await linkTestCopyrightEmailIntake(initial.id, notice.noticeId)
    await linkTestCopyrightEmailIntake(reply.id, notice.noticeId, 'thread', notice.moderator.id)
    const before = await readCopyrightThreadReferenceState(reply.id)
    await positionCopyrightOperationalCursor('email_thread_references', notice.noticeId)
    let holdId: string | undefined
    const failures: unknown[] = []
    try {
      const result = await holdCopyrightCaseBeforeThreadEligibility(
        notice.noticeId,
        async () => {
          holdId = (
            await placeCopyrightCasePreservationHold(
              notice.moderator,
              notice.noticeId,
              'litigation_threat',
            )
          ).id
        },
        () =>
          sweepCopyrightCaseThreads({
            now: new Date(Date.now() + 181 * day),
            replyDays: 180,
            batchSize: 10,
            maxBatches: 100,
          }),
        err => failures.push(err),
      )
      expect(failures).toEqual([expect.objectContaining({ code: '40001' })])
      expect(result.deleted).toBe(0)
      expect(await readCopyrightThreadReferenceState(reply.id)).toEqual(before)
    } finally {
      if (holdId)
        await releaseCopyrightCasePreservationHold(notice.moderator, notice.noticeId, holdId)
    }
  })
})

describe('thread evidence admission and retirement commit order', () => {
  useCopyrightOperationalCursorReservation()
  const options = () => ({
    now: new Date(Date.now() + 181 * day),
    replyDays: 180,
    batchSize: 10,
    maxBatches: 100,
  })
  it('keeps the admitted evidence when its writer commits before the retirement marker', async () => {
    const { notice, reply, candidate } = await createCopyrightThreadMarkerScene()
    const before = await readCopyrightThreadReferenceState(reply.id)
    const failures: unknown[] = []
    let admitted: unknown
    const result = await holdCopyrightCaseBeforeThreadEligibility(
      notice.noticeId,
      async () => {
        admitted = await associateCopyrightEmailIntakeWithNotice(
          notice.moderator,
          candidate.id,
          notice.noticeId,
        )
      },
      () => sweepCopyrightCaseThreads(options()),
      err => failures.push(err),
    )
    expect(admitted).toEqual({
      copyright_notice: { id: notice.noticeId },
      copyright_email_intake: { id: candidate.id },
    })
    expect(failures).toEqual([expect.objectContaining({ code: '40001' })])
    expect(result.deleted).toBe(0)
    expect(await readCopyrightThreadReferenceState(reply.id)).toEqual(before)
    expect(await readCopyrightEmailIntakeNoticeLinks(candidate.id)).toEqual([
      expect.objectContaining({
        copyright_notice_id: notice.noticeId,
        link_kind: 'thread',
      }),
    ])
    expect(await readCopyrightEmailManualAssociationReview(candidate.id)).toEqual([
      { copyright_notice_id: notice.noticeId, action: 'pending' },
    ])
    expect(await readCopyrightEmailManualAssociationEvent(candidate.id)).toEqual([
      {
        copyright_notice_id: notice.noticeId,
        changed_by_id: notice.moderator.id,
        copyright_notice_email_intake_id: candidate.id,
      },
    ])
  })
  it('rolls back the overlapping writer and rejects later graph admission after retirement commits', async () => {
    const { notice, reply, candidate } = await createCopyrightThreadMarkerScene()
    await expect(
      afterCopyrightThreadRetirementRead(
        notice.noticeId,
        async () => {
          const result = await sweepCopyrightCaseThreads(options())
          expect(result.deleted).toBeGreaterThan(0)
          expect((await readCopyrightThreadReferenceState(reply.id)).referenceCount).toBe(0)
        },
        () =>
          associateCopyrightEmailIntakeWithNotice(notice.moderator, candidate.id, notice.noticeId),
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: 'copyright_email_thread_changed',
      cause: { code: '40001' },
    })
    expect(await readCopyrightEmailIntakeNoticeLinks(candidate.id)).toEqual([])
    expect(await readCopyrightEmailManualAssociationReview(candidate.id)).toEqual([])
    expect(await readCopyrightEmailManualAssociationEvent(candidate.id)).toEqual([])
    await expect(
      associateCopyrightEmailIntakeWithNotice(notice.moderator, candidate.id, notice.noticeId),
    ).rejects.toMatchObject({
      status: 409,
      code: 'copyright_email_thread_changed',
      message: 'Copyright case email threading has been retired',
    })
    expect(await readCopyrightEmailIntakeNoticeLinks(candidate.id)).toEqual([])
    expect(await readCopyrightEmailManualAssociationReview(candidate.id)).toEqual([])
    expect(await readCopyrightEmailManualAssociationEvent(candidate.id)).toEqual([])
  })
  it('keeps a later absent-case dependency after a different marker was found', async () => {
    const retired = await createRetentionMinimalCase()
    await seedCopyrightThreadRetirement(retired.noticeId, retired.noticeId)
    const { notice } = await createCopyrightThreadMarkerScene()
    await expect(
      assessAfterMixedCopyrightRetirementRead(
        [retired.noticeId, notice.noticeId],
        notice.submissionId,
        notice.moderator,
        async () => {
          expect((await sweepCopyrightCaseThreads(options())).deleted).toBeGreaterThan(0)
        },
      ),
    ).rejects.toMatchObject({ code: '40001' })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.noticeId)
    expect(aggregate?.assessments).toEqual([])
    expect(
      aggregate?.lifecycleEvents.filter(event => event.change_type === 'submission_assessed'),
    ).toEqual([])
  })
})
