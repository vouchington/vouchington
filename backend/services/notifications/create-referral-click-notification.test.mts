import { it, expect, describe } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { createReferralClickNotification } from './create-referral-click-notification.mts'
import { listNotifications } from './list.mts'

describe('create-referral-click-notification', () => {
  it('creates referral click notification with landing URL in body', async () => {
    const referrer = await createTestUserDirect()
    const landingUrl = 'https://example.com/my-referral-page'

    const result = await createReferralClickNotification(referrer.id, landingUrl)

    expect(result).toHaveLength(1)
    expect(result[0]!.user_id).toBe(referrer.id)

    const { notifications } = await listNotifications(referrer.id)
    const notification = notifications[result[0]!.id]
    expect(notification?.entity_type).toBe('referral_click')
    expect(notification?.actor_user_id).toBeNull()
    expect(notification?.title).toBe('Someone clicked your referral link')
    expect(notification?.body).toBe(landingUrl)
    expect(notification?.target_path).toBe('/my/referrals')
  })

  it('truncates long landing URL in notification body to 180 characters', async () => {
    const referrer = await createTestUserDirect()
    const longUrl = `https://example.com/${'a'.repeat(200)}`

    const result = await createReferralClickNotification(referrer.id, longUrl)

    expect(result).toHaveLength(1)

    const { notifications } = await listNotifications(referrer.id)
    const notification = notifications[result[0]!.id]
    expect(notification?.body.length).toBeLessThanOrEqual(180)
    expect(notification?.body).toMatch(/…$/)
  })
})
