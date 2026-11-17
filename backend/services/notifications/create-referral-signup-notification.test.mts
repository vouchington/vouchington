import { renderListedNotification } from '../../test-helpers/services/notifications/render-listed-notification.mts'
import { it, expect, describe } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { createReferralSignupNotification } from './create-referral-signup-notification.mts'
import { listNotifications } from './list.mts'

describe('create-referral-signup-notification', () => {
  it('creates referral signup notification with username in title', async () => {
    const referrer = await createTestUserDirect()
    const newUser = await createTestUserDirect()

    const username = newUser.username ?? null
    const result = await createReferralSignupNotification(referrer.id, newUser.id, username)

    expect(result).toHaveLength(1)
    expect(result[0]!.user_id).toBe(referrer.id)

    const page = await listNotifications(referrer.id)
    const notification = page.notifications[result[0]!.id]
    expect(notification?.entity_type).toBe('referral_signup')
    expect(notification?.actor_user_id).toBe(newUser.id)
    expect(notification?.target_path).toBe(`/user/${username}`)
    const text = renderListedNotification(page, result[0]!.id)
    expect(text.title).toBe(`@${username} signed up through your referral!`)
    expect(text.body).toMatch(/You now have \d+ referral/)
  })

  it('creates referral signup notification with null username', async () => {
    const referrer = await createTestUserDirect()
    const newUser = await createTestUserDirect()

    const result = await createReferralSignupNotification(referrer.id, newUser.id, null)

    expect(result).toHaveLength(1)
    expect(result[0]!.user_id).toBe(referrer.id)

    const page = await listNotifications(referrer.id)
    const notification = page.notifications[result[0]!.id]
    expect(notification?.entity_type).toBe('referral_signup')
    expect(notification?.actor_user_id).toBe(newUser.id)
    expect(notification?.target_path).toBe('/')
    // The name is read from the new user's profile when the row is read, not stored.
    expect(renderListedNotification(page, result[0]!.id).title).toBe(
      `@${newUser.username} signed up through your referral!`,
    )
  })
})
