import { describe, expect, it } from 'vitest'
import { createTestUserDirect, getSessionReferralAttributions } from '@voucha/test-helpers'
import { holdQueueAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { notifications } from '@queues/notifications/queues'
import { v7 as uuidv7 } from 'uuid'
import { createSessionReferralAttribution } from './create.mts'

describe('referral click admission', () => {
  it('awaits referral click admission after committing a new attribution pair', async () => {
    const referrer = await createTestUserDirect()
    const sessionId = uuidv7()
    const landingUrl = `https://example.test/${uuidv7()}`
    const gate = holdQueueAdmission(
      notifications,
      'notifications.processReferralClickNotification',
      data =>
        typeof data === 'object' &&
        data !== null &&
        'referrerId' in data &&
        data.referrerId === referrer.id,
    )
    let settled = false
    const mutation = createSessionReferralAttribution({
      sessionId,
      referrer: referrer.id,
      landingUrl,
    }).then(() => {
      settled = true
      return undefined
    })
    void mutation.catch(() => undefined)
    try {
      await gate.entered
      expect(await getSessionReferralAttributions(sessionId)).toHaveLength(1)
      expect(settled).toBe(false)
      gate.release()
      await mutation
      expect(await gate.admitted).not.toBeNull()
    } finally {
      gate.release()
      await mutation.catch(() => undefined)
      await (await gate.admitted.catch(() => null))?.remove()
      gate.restore()
    }
  })
})
