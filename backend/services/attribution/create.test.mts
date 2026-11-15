import { describe, expect, it } from 'vitest'
import { createTestUserDirect, getSessionReferralAttributions } from '@voucha/test-helpers'
import { notifications } from '@queues/notifications/queues'
import { v7 as uuidv7 } from 'uuid'
import { createSessionReferralAttribution } from './create.mts'
import { updateAttributionSignup } from './update-signup.mts'

describe('append-only referral clicks', () => {
  it('preserves each click and its own signed-in identity without repeating the first-pair notification', async () => {
    const referrer = await createTestUserDirect()
    const user = await createTestUserDirect()
    const sessionId = uuidv7()
    await createSessionReferralAttribution({
      sessionId,
      referrer: referrer.id,
      landingUrl: 'https://example.com/first',
      userId: user.id,
    })
    const [first] = await getSessionReferralAttributions(sessionId)
    await createSessionReferralAttribution({
      sessionId,
      referrer: referrer.id,
      landingUrl: 'https://example.com/second',
    })
    const rows = await getSessionReferralAttributions(sessionId)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(first)
    expect(rows[1]).toMatchObject({ landing_url: 'https://example.com/second', user_id: null })
    const jobs = await notifications.searchJobs({
      name: 'notifications.processReferralClickNotification',
      data: { referrerId: referrer.id },
    })
    expect(jobs).toHaveLength(1)
  })

  it('converts only the latest unconverted click and preserves it when another click arrives', async () => {
    const referrer = await createTestUserDirect()
    const user = await createTestUserDirect()
    const sessionId = uuidv7()
    for (const path of ['first', 'second']) {
      await createSessionReferralAttribution({
        sessionId,
        referrer: referrer.id,
        landingUrl: `https://example.com/${path}`,
      })
    }
    await updateAttributionSignup(sessionId, referrer.id, user.id)
    const converted = await getSessionReferralAttributions(sessionId)
    expect(converted[0]).toMatchObject({ signed_up_at: null, user_id: null })
    expect(converted[1]!.signed_up_at).toBeInstanceOf(Date)
    expect(converted[1]!.user_id).toBe(user.id)
    await createSessionReferralAttribution({
      sessionId,
      referrer: referrer.id,
      landingUrl: 'https://example.com/third',
    })
    const rows = await getSessionReferralAttributions(sessionId)
    expect(rows).toHaveLength(3)
    expect(rows.slice(0, 2)).toEqual(converted)
    expect(rows[2]).toMatchObject({ signed_up_at: null, user_id: null })
  })

  it('retains both overlapping clicks', async () => {
    const referrer = await createTestUserDirect()
    const sessionId = uuidv7()
    await Promise.all(
      ['first', 'second'].map(path =>
        createSessionReferralAttribution({
          sessionId,
          referrer: referrer.id,
          landingUrl: `https://example.com/${path}`,
        }),
      ),
    )
    const rows = await getSessionReferralAttributions(sessionId)
    expect(rows).toHaveLength(2)
    expect(rows.map(row => row.landing_url).toSorted()).toEqual([
      'https://example.com/first',
      'https://example.com/second',
    ])
  })
})
