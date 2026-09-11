import { it, expect, beforeAll, describe } from 'vitest'
import { createTestUserDirect, insertSessionReferralAttribution } from '@voucha/test-helpers'
import { v7 as uuidv7 } from 'uuid'
import { getReferralClickLog } from './click-log.mts'
import { createSessionReferralAttribution } from './create.mts'
import { updateAttributionSignup } from './update-signup.mts'
import type { PrivateUser } from '@voucha/types/entities/user'

describe('click-log', () => {
  let referrer: PrivateUser
  let signedUpUser: PrivateUser

  beforeAll(async () => {
    referrer = await createTestUserDirect()
    signedUpUser = await createTestUserDirect()
  })

  it('returns empty log when no attributions exist for user', async () => {
    const freshUser = await createTestUserDirect()
    const result = await getReferralClickLog(freshUser.id)

    expect(result.results).toHaveLength(0)
    expect(result.page_info.has_next_page).toBe(false)
    expect(result.page_info.end_cursor).toBeNull()
  })

  it('returns click log entries for referrer', async () => {
    const sessionId = uuidv7()
    const landingUrl = `https://example.com/click-log-test-${Date.now()}`
    await insertSessionReferralAttribution(sessionId, referrer.id, landingUrl)

    const result = await getReferralClickLog(referrer.id)

    const matchingResult = result.results.find(r => result.clicks[r.id]?.landing_url === landingUrl)
    expect(matchingResult).toBeDefined()

    const click = result.clicks[matchingResult!.id]
    expect(click?.landing_url).toBe(landingUrl)
    expect(click?.signed_up_at).toBeNull()
    expect(click?.user_id).toBeNull()
  })

  it('populates signed_up_at after updateAttributionSignup', async () => {
    const sessionId = uuidv7()
    const landingUrl = `https://example.com/signup-test-${Date.now()}`
    await insertSessionReferralAttribution(sessionId, referrer.id, landingUrl)

    await updateAttributionSignup(sessionId, referrer.id, signedUpUser.id)

    const result = await getReferralClickLog(referrer.id)
    const matchingResult = result.results.find(r => result.clicks[r.id]?.landing_url === landingUrl)
    expect(matchingResult).toBeDefined()

    const click = result.clicks[matchingResult!.id]
    expect(click?.signed_up_at).not.toBeNull()
    expect(click?.user_id).toBe(signedUpUser.id)
  })

  it('returns user info for signed-up users', async () => {
    const sessionId = uuidv7()
    const landingUrl = `https://example.com/user-info-test-${Date.now()}`
    await insertSessionReferralAttribution(sessionId, referrer.id, landingUrl, signedUpUser.id)

    const result = await getReferralClickLog(referrer.id)
    const matchingResult = result.results.find(r => result.clicks[r.id]?.landing_url === landingUrl)
    expect(matchingResult).toBeDefined()

    const userId = result.clicks[matchingResult!.id]?.user_id
    expect(userId).toBe(signedUpUser.id)

    const userInfo = userId ? result.users[userId] : null
    expect(userInfo).toBeDefined()
    expect(userInfo?.id).toBe(signedUpUser.id)
  })

  it('paginates results with cursor', async () => {
    const paginationReferrer = await createTestUserDirect()

    // Insert 3 attribution records
    for (let i = 0; i < 3; i++) {
      await insertSessionReferralAttribution(
        uuidv7(),
        paginationReferrer.id,
        `https://example.com/pagination-test-${i}-${Date.now()}`,
      )
    }

    const page1 = await getReferralClickLog(paginationReferrer.id, { limit: 2 })
    expect(page1.results).toHaveLength(2)
    expect(page1.page_info.has_next_page).toBe(true)
    expect(page1.page_info.end_cursor).not.toBeNull()

    const page2 = await getReferralClickLog(paginationReferrer.id, {
      limit: 2,
      after: page1.page_info.end_cursor!,
    })
    expect(page2.results).toHaveLength(1)
    expect(page2.page_info.has_next_page).toBe(false)
  })

  it('moves a re-clicked session to the front of recency order (most-recent-first display)', async () => {
    // Product decision (see attribution/README.md § Retention & dedup): sessions A, B, C click
    // the same referrer in order, then A clicks again. Ascending recency becomes B, C, A; the
    // click log's `ORDER BY sra.id DESC` display is the reverse: A, C, B.
    const orderingReferrer = await createTestUserDirect()
    const sessionA = uuidv7()
    const sessionB = uuidv7()
    const sessionC = uuidv7()
    const urlA = `https://example.com/click-log-order-a-${uuidv7()}`
    const urlB = `https://example.com/click-log-order-b-${uuidv7()}`
    const urlC = `https://example.com/click-log-order-c-${uuidv7()}`
    const urlARepeat = `https://example.com/click-log-order-a-again-${uuidv7()}`

    await createSessionReferralAttribution({
      sessionId: sessionA,
      referrer: orderingReferrer.id,
      landingUrl: urlA,
    })
    await createSessionReferralAttribution({
      sessionId: sessionB,
      referrer: orderingReferrer.id,
      landingUrl: urlB,
    })
    await createSessionReferralAttribution({
      sessionId: sessionC,
      referrer: orderingReferrer.id,
      landingUrl: urlC,
    })
    await createSessionReferralAttribution({
      sessionId: sessionA,
      referrer: orderingReferrer.id,
      landingUrl: urlARepeat,
    })

    const result = await getReferralClickLog(orderingReferrer.id)
    const orderedUrls = result.results.map(r => result.clicks[r.id]!.landing_url)
    expect(orderedUrls).toEqual([urlARepeat, urlC, urlB])
  })
})
