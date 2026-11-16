import { randomBytes, randomUUID } from 'node:crypto'
import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import { readCopyrightEmailAncestorIds } from '@voucha/test-helpers/copyright-email-ancestor-edges'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import {
  positionCopyrightOperationalCursor,
  readCopyrightThreadOperationalCursor,
} from '@voucha/test-helpers/copyright-operational-retention'
import { readCopyrightThreadReferenceState } from '@voucha/test-helpers/copyright-operational-email-retention'
import { readCopyrightThreadRetirementBound } from '@voucha/test-helpers/copyright-thread-retention'
import { readTestRepeatInfringerIncidents } from '@voucha/test-helpers/copyright-repeat-infringer'
import { liftTestCopyrightRestriction } from '@voucha/test-helpers/data-stores/psql/copyright-form-reviews'
import { readCopyrightEmailIntakeNoticeLinks } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { afterPostgresTransactionQueryForTest } from '@voucha/test-helpers/injected-postgres-transactions'
import {
  copyrightEmailMessageId,
  copyrightEmailPromotionInput,
  recordThreadedCopyrightEmail,
} from '@voucha/test-helpers/services/copyright-notices/email-thread-cases'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { sendAllCopyrightDeliveries } from '@voucha/test-helpers/services/copyright-notices/retention-deliveries'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createCopyrightEmailIntake } from './email-intakes.mts'
import { createRetentionMinimalCase } from '@voucha/test-helpers/services/copyright-notices/retention-minimal-case'
import { createOutboundCopyrightCorrespondence } from './correspondence.mts'
import {
  claimCopyrightDeliveryIntent,
  createCopyrightDeliveryIntent,
  markCopyrightDeliveryIntentSent,
} from './delivery-intents.mts'
import { findOutboundCopyrightEmailThreadMatch } from './email-threading-outbound.mts'
import { recordRejectedCopyrightCorrespondenceReview } from './email-correspondence-review.mts'
import { recordCopyrightEmailParse } from './email-intake-parses.mts'
import { promoteCopyrightEmailIntake } from './email-promotion.mts'
import { recordCopyrightEmailThreadReferences } from './email-threading.mts'
import { readCopyrightEmailThreadGraph } from './email-thread-graph.mts'
import { recordCopyrightRepeatInfringerDisposition } from './repeat-infringer-incidents.mts'
import { sweepCopyrightCaseThreads } from './operational-retention-threading.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('copyright delayed email derivation after retirement', () => {
  useCopyrightOperationalCursorReservation()

  it('blocks a late committed edge from routing and removes it in the next bounded cycle', async () => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const rootMessageId = copyrightEmailMessageId()
    const parentMessageId = copyrightEmailMessageId()
    const root = await recordThreadedCopyrightEmail({ messageId: rootMessageId })
    const parent = await recordThreadedCopyrightEmail({
      messageId: parentMessageId,
      inReplyTo: [rootMessageId],
    })
    expect(await readCopyrightEmailAncestorIds(parent.intakeId)).toEqual([root.intakeId])
    expect(await readCopyrightEmailIntakeNoticeLinks(parent.intakeId)).toEqual([])
    const promotionInput = await copyrightEmailPromotionInput(moderator, root.intakeId)
    const outboundOwner = await createRetentionMinimalCase()
    const correspondence = await createOutboundCopyrightCorrespondence({
      noticeId: outboundOwner.noticeId,
      submissionId: null,
      correspondenceKind: 'status_update',
      compositionKind: 'deterministic_template',
      bodyCiphertext: `body-${randomUUID()}`,
      draftedById: null,
    })
    const intent = await createCopyrightDeliveryIntent({
      noticeId: outboundOwner.noticeId,
      submissionId: null,
      correspondenceId: correspondence.id,
      recipientUserId: null,
      recipientRole: 'claimant',
      deliveryKind: 'status_update',
      channel: 'email',
      idempotencyKey: `delayed-outbound-${randomUUID()}`,
      recipientEmail: `claimant-${randomUUID()}@example.test`,
    })
    const claim = await claimCopyrightDeliveryIntent(intent.id)
    if (claim?.state !== 'claimed') throw new Error('Owned outbound delivery was not claimed')
    const outboundMessageId = `ses-delayed-outbound-${randomUUID()}`
    expect(
      await markCopyrightDeliveryIntentSent({
        intentId: intent.id,
        leaseToken: claim.lease_token,
        sesMessageId: outboundMessageId,
      }),
    ).toBe(true)
    expect(await findOutboundCopyrightEmailThreadMatch([outboundMessageId])).toMatchObject({
      noticeId: outboundOwner.noticeId,
    })
    const sesMessageId = `ses-delayed-${randomUUID()}`
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId,
      receivedAt: new Date(),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: randomBytes(32),
      rawMimeType: 'message/rfc822',
      rawByteSize: 24,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    const parse = {
      status: 'succeeded' as const,
      fromEmail: `claimant-${randomUUID()}@example.test`,
      subject: 'Delayed reply',
      bodyText: 'Reply to a parsed parent.',
      messageId: copyrightEmailMessageId(),
      inReplyTo: [parentMessageId],
      replyReferences: [`<${outboundMessageId}>`],
      attachments: [],
    }
    const inserted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const restore = afterPostgresTransactionQueryForTest(
      'recordCopyrightEmailAncestorEdges',
      values => values.includes(intake.id),
      async () => {
        // Other transactions must use the genuine pool while this real INSERT stays uncommitted.
        restore()
        inserted.resolve()
        await release.promise
      },
    )
    onTestFinished(() => {
      release.resolve()
      restore()
    })
    const delayed = recordCopyrightEmailParse(intake, parse)
    void delayed
      .then(() => inserted.reject(new Error('Derivation completed before the owned edge hook ran')))
      .catch(inserted.reject)
    try {
      await inserted.promise
      // The edge is absent to promotion, but the first parse and its facts already committed.
      expect(await readCopyrightEmailAncestorIds(intake.id)).toEqual([])
      expect((await readCopyrightThreadReferenceState(intake.id)).referenceCount).toBe(3)
      const promoted = await promoteCopyrightEmailIntake(promotionInput)
      expect(await readCopyrightEmailIntakeNoticeLinks(parent.intakeId)).toEqual([
        { copyright_notice_id: promoted.noticeId, link_kind: 'thread' },
      ])
      await using reviewTransaction = await beginTransaction()
      await recordRejectedCopyrightCorrespondenceReview(reviewTransaction, {
        input: {
          currentUser: moderator,
          intakeId: parent.intakeId,
          kind: 'supplement',
          recommendationId: null,
        },
        noticeId: promoted.noticeId,
        rationaleCiphertext: 'v1:fixture-rationale',
        manualFallbackCiphertext: 'v1:fixture-fallback',
      })
      await reviewTransaction.commit()
      const aggregate = await getCopyrightNoticePrivateAggregate(promoted.noticeId)
      for (const restriction of aggregate?.restrictions ?? [])
        await liftTestCopyrightRestriction(restriction.id)
      const posterId = aggregate?.deliveryIntents.find(
        delivery => delivery.recipient_role === 'poster',
      )?.recipient_user_id
      if (!posterId) throw new Error('Owned promotion has no poster delivery')
      const incident = (await readTestRepeatInfringerIncidents(posterId)).find(
        row => row.copyright_notice_id === promoted.noticeId,
      )
      if (!incident) throw new Error('Promotion did not create the owned incident')
      await recordCopyrightRepeatInfringerDisposition({
        currentUser: moderator,
        incidentId: incident.id,
        disposition: 'duplicate',
        rationale: 'The owned incident duplicates an earlier notice.',
        recordedAt: new Date(),
      })
      await sendAllCopyrightDeliveries(promoted.noticeId)
      const now = new Date(Date.now() + 181 * DAY_MS)
      const sweepOptions = {
        now,
        replyDays: 180,
        batchSize: 2,
        maxBatches: 100,
        noticeIds: [promoted.noticeId],
      }
      await positionCopyrightOperationalCursor('email_thread_references', promoted.noticeId)
      const firstCycle = await sweepCopyrightCaseThreads(sweepOptions)
      expect(firstCycle.hasMore).toBe(false)
      expect(await readCopyrightThreadOperationalCursor()).toEqual({
        cursor_record_id: null,
        cursor_child_id: null,
        cursor_phase: null,
        cursor_legal_phase: null,
      })
      expect(firstCycle.deleted).toBeGreaterThan(0)
      expect(await findOutboundCopyrightEmailThreadMatch([outboundMessageId])).toMatchObject({
        noticeId: outboundOwner.noticeId,
      })
      expect(await readCopyrightThreadRetirementBound(promoted.noticeId)).not.toBeNull()
      expect((await readCopyrightThreadReferenceState(parent.intakeId)).referenceCount).toBe(0)
      const retiredRoot = await readCopyrightThreadReferenceState(root.intakeId)
      const retiredParent = await readCopyrightThreadReferenceState(parent.intakeId)
      // An existing immutable case link also cannot authorize renewed routing after retirement.
      await expect(
        recordCopyrightEmailThreadReferences({
          intakeId: parent.intakeId,
          messageId: parentMessageId,
          inReplyTo: [rootMessageId],
          references: [`<${outboundMessageId}>`],
        }),
      ).resolves.toBeNull()
      expect(await readCopyrightEmailIntakeNoticeLinks(parent.intakeId)).toEqual([
        { copyright_notice_id: promoted.noticeId, link_kind: 'thread' },
      ])
      release.resolve()
      await expect(delayed).resolves.toBeNull()
      expect(await readCopyrightEmailAncestorIds(intake.id)).toEqual([parent.intakeId])
      expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
      await using graphTransaction = await beginTransaction()
      await expect(
        readCopyrightEmailThreadGraph(graphTransaction, intake.id, 10),
      ).rejects.toMatchObject({ status: 409 })
      await expect(
        readCopyrightEmailThreadGraph(graphTransaction, parent.intakeId, 10),
      ).rejects.toMatchObject({ status: 409 })
      await graphTransaction.commit()
      await expect(recordCopyrightEmailParse(intake, parse)).resolves.toBeNull()
      expect(await readCopyrightThreadReferenceState(root.intakeId)).toEqual(retiredRoot)
      expect(await readCopyrightThreadReferenceState(parent.intakeId)).toEqual(retiredParent)
      const nextCycle = await sweepCopyrightCaseThreads(sweepOptions)
      expect(nextCycle.hasMore).toBe(false)
      expect(nextCycle.deleted).toBeGreaterThan(0)
      expect(await findOutboundCopyrightEmailThreadMatch([outboundMessageId])).toMatchObject({
        noticeId: outboundOwner.noticeId,
      })
      expect(await readCopyrightEmailAncestorIds(intake.id)).toEqual([])
      expect(await readCopyrightEmailIntakeNoticeLinks(intake.id)).toEqual([])
    } finally {
      release.resolve()
      await Promise.allSettled([delayed])
      restore()
    }
  })
})
