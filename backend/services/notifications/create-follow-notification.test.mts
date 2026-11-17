import { renderListedNotification } from '../../test-helpers/services/notifications/render-listed-notification.mts'
import { it, expect, describe } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { createFollowNotification } from './create-follow-notification.mts'
import { listNotifications } from './list.mts'

describe('create-follow-notification', () => {
  it('creates follow notification with username in title', async () => {
    const followee = await createTestUserDirect()
    const follower = await createTestUserDirect()

    const result = await createFollowNotification(followee.id, follower.id, follower.username)

    expect(result).toHaveLength(1)
    expect(result[0]!.user_id).toBe(followee.id)

    const page = await listNotifications(followee.id)
    const notification = page.notifications[result[0]!.id]
    expect(notification?.entity_type).toBe('follow')
    expect(notification?.kind).toBe('follow')
    expect(notification?.actor_user_id).toBe(follower.id)
    expect(renderListedNotification(page, result[0]!.id).title).toBe(
      `@${follower.username} started following you`,
    )
    expect(notification?.target_path).toBe(`/user/${follower.username}`)
  })

  it('creates follow notification with null username', async () => {
    const followee = await createTestUserDirect()
    const follower = await createTestUserDirect()

    const result = await createFollowNotification(followee.id, follower.id, null)

    expect(result).toHaveLength(1)

    const page = await listNotifications(followee.id)
    const notification = page.notifications[result[0]!.id]
    expect(notification?.entity_type).toBe('follow')
    expect(notification?.actor_user_id).toBe(follower.id)
    // The name is read from the follower's profile when the row is read, not stored.
    expect(renderListedNotification(page, result[0]!.id).title).toBe(
      `@${follower.username} started following you`,
    )
    expect(notification?.target_path).toBe('/')
  })

  it('creates referral signup follow notification with different title', async () => {
    const followee = await createTestUserDirect()
    const follower = await createTestUserDirect()

    const result = await createFollowNotification(followee.id, follower.id, follower.username, {
      isReferralSignup: true,
    })

    expect(result).toHaveLength(1)

    const page = await listNotifications(followee.id)
    expect(page.notifications[result[0]!.id]?.kind).toBe('follow_referral_signup')
    expect(renderListedNotification(page, result[0]!.id).title).toBe(
      `Your referral @${follower.username} signed up and followed you!`,
    )
  })

  it('deduplicates follow notifications - second call returns empty', async () => {
    const followee = await createTestUserDirect()
    const follower = await createTestUserDirect()

    const first = await createFollowNotification(followee.id, follower.id, follower.username)
    expect(first).toHaveLength(1)

    const second = await createFollowNotification(followee.id, follower.id, follower.username)
    expect(second).toHaveLength(0)
  })
})
