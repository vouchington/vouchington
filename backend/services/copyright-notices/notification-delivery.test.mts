import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { createCopyrightNoticeNotification, listNotifications } from '@services/notifications'
import { createCopyrightNoticeAggregate } from './index.mts'

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
    await insertTestPostImage({ postId, imageId })
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
          placementKey: `post-image:${postId}:${imageId}`,
          placementRevision: 1,
          imageId,
          hostedUseUrl: `https://voucha.ai/posts/${postId}`,
        },
      ],
    })
    const eventKey = `copyright-delivery-${crypto.randomUUID()}`

    await createCopyrightNoticeNotification({
      userId: user.id,
      noticeId: notice.id,
      eventKey,
      deliveryKind: 'poster_restriction_notice',
    })
    await createCopyrightNoticeNotification({
      userId: user.id,
      noticeId: notice.id,
      eventKey,
      deliveryKind: 'poster_restriction_notice',
    })
    await createCopyrightNoticeNotification({
      userId: user.id,
      noticeId: notice.id,
      eventKey: `copyright-delivery-${crypto.randomUUID()}`,
      deliveryKind: 'status_update',
    })

    const { notifications } = await listNotifications(user.id)
    expect(Object.values(notifications)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_key: eventKey,
          copyright_notice_id: notice.id,
          target_path: `/copyright-notices/${notice.id}`,
        }),
      ]),
    )
  })
})
