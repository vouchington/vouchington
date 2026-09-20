import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import {
  appendCopyrightNoticeSubmission,
  appendCopyrightSubmissionAssessment,
  approveCopyrightCorrespondence,
  claimCopyrightDeliveryIntent,
  createCopyrightDeliveryIntent,
  createCopyrightNoticeAggregate,
  createEligibleCopyrightRestoreIntent,
  deliverCopyrightInAppNotification,
  prepareCopyrightEmailDelivery,
  createOutboundCopyrightCorrespondence,
  getCopyrightNoticePrivateAggregate,
  markCopyrightDeliveryIntentBouncedBySesMessageId,
  markCopyrightDeliveryIntentFailed,
  markCopyrightDeliveryIntentSent,
} from './index.mts'
import { resolveCopyrightEmailRecipient } from './delivery-transport.mts'

async function createFixture() {
  const [claimant, moderatorRecord] = await Promise.all([
    createTestUserDirect(),
    createTestUserDirect(),
  ])
  const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
  const postId = await insertTestPost({
    title: `copyright persistence ${crypto.randomUUID()}`,
    slug: `copyright-persistence-${crypto.randomUUID()}`,
    createdById: claimant.id,
    markdown: 'image',
  })
  const imageId = await insertTestImage(claimant.id)
  await insertTestPostImage({ postId, imageId })
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-06-30T16:00:00.000Z'),
    claimantUserId: claimant.id,
    claimantDisplayName: 'private snapshot',
    claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'signed_in_form',
      bodyCiphertext: `notice-${crypto.randomUUID()}`,
    },
    targets: [
      {
        placementKey: `post-image:${postId}:${imageId}`,
        placementRevision: 1,
        imageId,
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
  if (!aggregate) throw new Error('fixture notice disappeared')
  return { aggregate, claimant, moderator, notice }
}

describe('copyright delivery and correspondence persistence', () => {
  it('delivers a claimed in-app copyright notice exactly once', async () => {
    const { claimant, notice } = await createFixture()
    const intent = await createCopyrightDeliveryIntent({
      noticeId: notice.id,
      submissionId: null,
      correspondenceId: null,
      recipientUserId: claimant.id,
      recipientRole: 'claimant',
      deliveryKind: 'claimant_receipt',
      channel: 'in_app',
      idempotencyKey: `copyright-in-app-${crypto.randomUUID()}`,
    })

    await expect(deliverCopyrightInAppNotification(intent.id)).resolves.toBe(true)
    await expect(deliverCopyrightInAppNotification(intent.id)).resolves.toBe(false)
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(aggregate?.deliveryIntents).toContainEqual(
      expect.objectContaining({ id: intent.id, channel: 'in_app', state: 'sent' }),
    )
  })

  it('fails closed for unavailable or private-recipient-less delivery intents', async () => {
    await expect(
      deliverCopyrightInAppNotification('00000000-0000-7000-8000-000000000071'),
    ).resolves.toBe(false)
    await expect(
      prepareCopyrightEmailDelivery('00000000-0000-7000-8000-000000000072'),
    ).rejects.toThrow('not available to send')
    await expect(
      resolveCopyrightEmailRecipient('00000000-0000-7000-8000-000000000073', null, 'claimant'),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('returns a wrongly routed claimed email intent to retryable state', async () => {
    const { notice } = await createFixture()
    const correspondence = await createOutboundCopyrightCorrespondence({
      noticeId: notice.id,
      submissionId: null,
      correspondenceKind: 'status_update',
      compositionKind: 'deterministic_template',
      bodyCiphertext: `status-${crypto.randomUUID()}`,
      draftedById: null,
    })
    const intent = await createCopyrightDeliveryIntent({
      noticeId: notice.id,
      submissionId: null,
      correspondenceId: correspondence.id,
      recipientUserId: null,
      recipientRole: 'correspondent',
      recipientEmail: `copyright-correspondent-${crypto.randomUUID()}@example.test`,
      deliveryKind: 'status_update',
      channel: 'email',
      idempotencyKey: `copyright-wrong-channel-${crypto.randomUUID()}`,
    })

    await expect(deliverCopyrightInAppNotification(intent.id)).rejects.toMatchObject({
      status: 422,
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(aggregate?.deliveryIntents).toContainEqual(
      expect.objectContaining({ id: intent.id, state: 'pending', channel: 'email' }),
    )
  })

  it('retains a retryable legal delivery obligation and exposes its terminal state', async () => {
    const { notice } = await createFixture()
    const correspondence = await createOutboundCopyrightCorrespondence({
      noticeId: notice.id,
      submissionId: null,
      correspondenceKind: 'receipt',
      compositionKind: 'deterministic_template',
      bodyCiphertext: `receipt-${crypto.randomUUID()}`,
      draftedById: null,
    })
    const recipientEmail = `tests+copyright-delivery-${crypto.randomUUID()}@voucha.ai`
    const intent = await createCopyrightDeliveryIntent({
      noticeId: notice.id,
      submissionId: null,
      correspondenceId: correspondence.id,
      recipientUserId: null,
      recipientRole: 'claimant',
      deliveryKind: 'claimant_receipt',
      channel: 'email',
      idempotencyKey: `copyright-delivery-${crypto.randomUUID()}`,
      recipientEmail,
    })
    expect((await claimCopyrightDeliveryIntent(intent.id))?.state).toBe('claimed')
    expect(
      await markCopyrightDeliveryIntentFailed({ intentId: intent.id, error: 'temporary' }),
    ).toBe(true)
    expect(await claimCopyrightDeliveryIntent(intent.id)).toBeNull()
    const bounceRecipientEmail = `tests+copyright-delivery-${crypto.randomUUID()}@voucha.ai`
    const bounceIntent = await createCopyrightDeliveryIntent({
      noticeId: notice.id,
      submissionId: null,
      correspondenceId: correspondence.id,
      recipientUserId: null,
      recipientRole: 'claimant',
      deliveryKind: 'claimant_receipt',
      channel: 'email',
      idempotencyKey: `copyright-delivery-${crypto.randomUUID()}`,
      recipientEmail: bounceRecipientEmail,
    })
    expect((await claimCopyrightDeliveryIntent(bounceIntent.id))?.state).toBe('claimed')
    const sesMessageId = `ses-${crypto.randomUUID()}`
    expect(await markCopyrightDeliveryIntentSent({ intentId: bounceIntent.id, sesMessageId })).toBe(
      true,
    )
    expect(
      await markCopyrightDeliveryIntentBouncedBySesMessageId({
        sesMessageId,
        recipientEmails: [`tests+unrelated-${crypto.randomUUID()}@voucha.ai`],
      }),
    ).toBe(0)
    expect(
      await markCopyrightDeliveryIntentBouncedBySesMessageId({
        sesMessageId,
        recipientEmails: [bounceRecipientEmail],
      }),
    ).toBe(1)
    const aggregate = await getCopyrightNoticePrivateAggregate(notice.id)
    expect(aggregate?.deliveryIntents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: intent.id, state: 'pending', ses_message_id: null }),
        expect.objectContaining({
          id: bounceIntent.id,
          state: 'bounced',
          ses_message_id: sesMessageId,
        }),
      ]),
    )
  })

  it('creates an immutable notice aggregate transactionally', async () => {
    const { aggregate, notice } = await createFixture()
    expect(aggregate.notice.id).toBe(notice.id)
    expect(aggregate.targets).toHaveLength(1)
    expect(aggregate.lifecycleEvents.map(event => event.event_type)).toContain('notice_received')
  })

  it('requires a reviewer for email and guest-form compliance assessments', async () => {
    const { notice } = await createFixture()
    const submission = await appendCopyrightNoticeSubmission({
      noticeId: notice.id,
      kind: 'notice',
      receivedAt: new Date('2026-07-01T12:00:00.000Z'),
      sourceKind: 'guest_form',
      submittedByUserId: null,
      bodyCiphertext: `guest-${crypto.randomUUID()}`,
    })
    await expect(
      appendCopyrightSubmissionAssessment({
        submissionId: submission.id,
        assessedAt: new Date('2026-07-01T12:01:00.000Z'),
        currentUser: null,
        substantiallyCompliant: true,
      }),
    ).rejects.toThrow('Email and guest-form assessments require a copyright reviewer')
  })

  it('rejects an explicit non-copyright placement blocker', async () => {
    const { aggregate, notice } = await createFixture()
    const target = aggregate.targets[0]
    await expect(
      createEligibleCopyrightRestoreIntent({
        noticeId: notice.id,
        targetId: target.id,
        restrictionId: crypto.randomUUID(),
        deadlineId: crypto.randomUUID(),
        expectedPlacementRevision: target.placement_revision,
        now: new Date(),
        blockers: ['deletion'],
      }),
    ).rejects.toThrow('A non-copyright placement blocker prevents restoration')
  })

  it('keeps outbound correspondence scoped to its own case and audits approval', async () => {
    const first = await createFixture()
    const second = await createFixture()
    await expect(
      createOutboundCopyrightCorrespondence({
        noticeId: first.notice.id,
        submissionId: second.aggregate.submissions[0].id,
        correspondenceKind: 'status_update',
        compositionKind: 'agent',
        bodyCiphertext: `draft-${crypto.randomUUID()}`,
        draftedById: null,
      }),
    ).rejects.toThrow('Copyright notice or case submission not found')
    const draft = await createOutboundCopyrightCorrespondence({
      noticeId: first.notice.id,
      submissionId: first.aggregate.submissions[0].id,
      correspondenceKind: 'status_update',
      compositionKind: 'agent',
      bodyCiphertext: `draft-${crypto.randomUUID()}`,
      draftedById: null,
    })
    await approveCopyrightCorrespondence({
      currentUser: first.moderator,
      correspondenceId: draft.id,
      approvedAt: new Date('2026-07-01T12:00:00.000Z'),
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(first.notice.id)
    expect(aggregate?.lifecycleEvents.map(event => event.event_type)).toEqual(
      expect.arrayContaining(['outbound_correspondence_created', 'agent_correspondence_approved']),
    )
  })
})
