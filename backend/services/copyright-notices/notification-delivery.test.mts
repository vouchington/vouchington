import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { createCopyrightNoticeNotification, listNotifications } from '@services/notifications'
import { createCopyrightNoticeAggregate } from '@voucha/test-helpers/services/copyright-notices/create-notice-aggregate'

describe('copyright in-app notification delivery', () => {
  it('persists a poster restriction notice once by its legal delivery key', async () => {
    const user = await createTestUser()
    const postId = await insertTestPost({
      title: `copyright notification ${crypto.randomUUID()}`,
      slug: `copyright-notification-${crypto.randomUUID()}`,
      createdById: user.id,
      markdown: 'image',
    })
    const imageId = await insertTestImage(user.id)
    const placementId = await insertTestPostImage({ postId, imageId })
    const notice = await createCopyrightNoticeAggregate({
      jurisdiction: 'us_dmca',
      receivedAt: new Date(),
      claimantUserId: user.id,
      claimantDisplayName: 'Claimant',
      claimantContactCiphertext: `ciphertext-${crypto.randomUUID()}`,
      workDescription: 'Original photograph',
      policyVersion: 'test-v1',
      initialSubmission: {
        kind: 'notice',
        sourceKind: 'signed_in_form',
        bodyCiphertext: 'ciphertext',
      },
      targets: [
        {
          placementId,
          placementRevision: 1,
          imageId,
          bindingFamily: 'post',
          hostedUseUrl: `https://voucha.ai/posts/${postId}`,
        },
      ],
    })
    const eventKey = `copyright-delivery-${crypto.randomUUID()}`
    const intent = await createCopyrightDeliveryIntent({
      noticeId: notice.id,
      submissionId: null,
      correspondenceId: null,
      recipientUserId: user.id,
      recipientRole: 'claimant',
      deliveryKind: 'status_update',
      channel: 'in_app',
      idempotencyKey: `copyright-delivery-intent:${crypto.randomUUID()}`,
    })

    await createCopyrightNoticeNotification({
      userId: user.id,
      noticeId: notice.id,
      eventKey,
      kind: 'copyright_poster_restriction_notice',
      aiAssisted: false,
      intentId: intent.id,
    })
    await createCopyrightNoticeNotification({
      userId: user.id,
      noticeId: notice.id,
      eventKey,
      kind: 'copyright_poster_restriction_notice',
      aiAssisted: false,
      intentId: intent.id,
    })
    await createCopyrightNoticeNotification({
      userId: user.id,
      noticeId: notice.id,
      eventKey: `copyright-delivery-${crypto.randomUUID()}`,
      kind: 'copyright_status_update',
      aiAssisted: false,
      intentId: intent.id,
    })

    const { notifications } = await listNotifications(user.id)
    expect(Object.values(notifications)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_key: eventKey,
          copyright_notice_id: notice.id,
          target_path: null,
          target_intent: 'notifications_inbox',
        }),
      ]),
    )
  })
})
