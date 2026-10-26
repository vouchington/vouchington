import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  createRandomEmailAddress,
  createTestUserDirect,
  insertSessionReferralAttribution,
} from '@voucha/test-helpers'
import { holdQueueAdmission } from '@voucha/test-helpers/queue-admission-hold'
import { emails } from '@queues/emails/queues'
import { notifications } from '@queues/notifications/queues'
import { upsertUser } from '../create.mts'
import { getPrivateUserByAny } from '../get.mts'

describe('signup notification admission', () => {
  it('commits signup before awaiting referral notification and welcome email admission', async () => {
    const referrer = await createTestUserDirect()
    const sessionId = v7()
    await insertSessionReferralAttribution(sessionId, referrer.id)
    const emailAddress = createRandomEmailAddress()
    let newUserId: string | undefined
    const referral = holdQueueAdmission(
      notifications,
      'notifications.processReferralSignupNotification',
      data => {
        if (
          typeof data !== 'object' ||
          data === null ||
          !('referrerId' in data) ||
          data.referrerId !== referrer.id ||
          !('newUserId' in data) ||
          typeof data.newUserId !== 'string'
        )
          return false
        newUserId = data.newUserId
        return true
      },
    )
    const welcome = holdQueueAdmission(
      emails,
      'processSendWelcomeEmail',
      data =>
        typeof data === 'object' &&
        data !== null &&
        'input' in data &&
        typeof data.input === 'object' &&
        data.input !== null &&
        'userId' in data.input &&
        data.input.userId === newUserId,
    )
    let settled = false
    const signup = upsertUser({ emailAddress, sessionId, deviceId: v7() }).then(user => {
      settled = true
      return user
    })
    void signup.catch(() => undefined)
    try {
      await referral.entered
      expect((await getPrivateUserByAny(emailAddress, { readOnly: false }))?.id).toBe(newUserId)
      expect(settled).toBe(false)
      referral.release()
      await welcome.entered
      expect(settled).toBe(false)
      welcome.release()
      expect((await signup).id).toBe(newUserId)
      expect(await referral.admitted).not.toBeNull()
      expect(await welcome.admitted).not.toBeNull()
    } finally {
      referral.release()
      welcome.release()
      await signup.catch(() => undefined)
      await (await referral.admitted.catch(() => null))?.remove()
      await (await welcome.admitted.catch(() => null))?.remove()
      referral.restore()
      welcome.restore()
    }
  })
})
