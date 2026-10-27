import { it, expect, describe } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import { createReferralClickNotification } from './create-referral-click-notification.mts'
import { listNotifications } from './list.mts'

describe('create-referral-click-notification', () => {
  it('creates referral click notification with an empty body', async () => {
    const referrer = await createTestUserDirect()
    const result = await createReferralClickNotification(referrer.id)

    expect(result).toHaveLength(1)
    expect(result[0]!.user_id).toBe(referrer.id)

    const { notifications } = await listNotifications(referrer.id)
    const notification = notifications[result[0]!.id]
    expect(notification?.entity_type).toBe('referral_click')
    expect(notification?.actor_user_id).toBeNull()
    expect(notification?.title).toBe('Someone clicked your referral link')
    expect(notification?.body).toBe('')
    expect(notification?.target_path).toBe('/my/referrals')
  })
})
