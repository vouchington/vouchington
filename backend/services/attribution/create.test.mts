import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  acquireTestSessionReferralAttributionPairLock,
  createTestUserDirect,
  flushPendingTasks,
  getSessionReferralAttributions,
  insertSessionReferralAttribution,
  softDeleteUser,
} from '@voucha/test-helpers'
import { notifications } from '@queues/notifications/queues'
import { v7 as uuidv7 } from 'uuid'
import { createSessionReferralAttribution } from './create.mts'
import { updateAttributionSignup } from './update-signup.mts'
import type { PrivateUser } from '@voucha/types/entities/user'

describe('createSessionReferralAttribution', () => {
  let referrer: PrivateUser
  let signedInUser: PrivateUser

  beforeAll(async () => {
    referrer = await createTestUserDirect()
    signedInUser = await createTestUserDirect()
  })

  // Every test in this file shares one `referrer`, so `enqueueReferralClickNotification`'s
  // debounce dedup id (keyed only on referrerId) collides across tests. Nothing in this project
  // attaches a `notifications` worker (see below) to move a prior test's job to a terminal state,
  // so without this a later test's enqueue is silently deduped against an earlier test's
  // still-`waiting` job. Obliterate so each test starts with a clean dedup slate.
  beforeEach(async () => {
    await notifications.obliterate({ force: true })
  })

  // No worker is attached to `notifications` in this project (backend-data-stores runs with
  // isolate: false, so a worker imported here would run fork-wide and start consuming jobs
  // enqueued by unrelated test files) — assert on the enqueued job itself instead of on
  // end-to-end notification delivery, matching
  // backend/services/rss-feed-items/upsert-enqueues.test.mts.
  async function referralClickJobWasEnqueued(landingUrl: string): Promise<boolean> {
    const jobs = await notifications.getJobs('waiting')
    return jobs.some(
      job =>
        job.name === 'processReferralClickNotification' &&
        (job.data as { referrerId?: string; landingUrl?: string }).landingUrl === landingUrl,
    )
  }

  it('creates a new attribution row for a new (session, referrer) pair and notifies the referrer', async () => {
    const sessionId = uuidv7()
    const landingUrl = `https://example.com/new-pair-${uuidv7()}`

    await createSessionReferralAttribution({ sessionId, referrer: referrer.id, landingUrl })

    const rows = await getSessionReferralAttributions(sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.referrer_id).toBe(referrer.id)
    expect(rows[0]!.landing_url).toBe(landingUrl)

    await expect.poll(() => referralClickJobWasEnqueued(landingUrl)).toBe(true)
  })

  it('a repeat click for the same pair replaces the row with a fresh, later id and does not duplicate the notification', async () => {
    const sessionId = uuidv7()
    const firstUrl = `https://example.com/page1-${uuidv7()}`
    const secondUrl = `https://example.com/page2-${uuidv7()}`

    await createSessionReferralAttribution({
      sessionId,
      referrer: referrer.id,
      landingUrl: firstUrl,
    })
    await expect.poll(() => referralClickJobWasEnqueued(firstUrl)).toBe(true)
    const [firstClick] = await getSessionReferralAttributions(sessionId)

    await createSessionReferralAttribution({
      sessionId,
      referrer: referrer.id,
      landingUrl: secondUrl,
    })
    // Negative assertion: give the (should-never-happen) enqueue a real chance to land before
    // asserting its absence, so a regression that does enqueue a second job is actually caught.
    await flushPendingTasks()

    const rows = await getSessionReferralAttributions(sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.landing_url).toBe(secondUrl)
    // Moved to latest: the repeat click replaces the row with a fresh, greater id.
    // (id is a UUIDv7 string, not a number/bigint, so this can't use toBeGreaterThan.)
    const movedToLatest = rows[0]!.id > firstClick!.id
    expect(movedToLatest).toBe(true)

    // The repeat click is not a new (session, referrer) pair, so no second notification job
    // is enqueued for it.
    expect(await referralClickJobWasEnqueued(secondUrl)).toBe(false)
  })

  it('freezes a converted row: id, user_id, and signed_up_at are unchanged by a repeat click', async () => {
    const sessionId = uuidv7()
    const convertedUser = await createTestUserDirect()
    const originalUrl = `https://example.com/converted-${uuidv7()}`

    await createSessionReferralAttribution({
      sessionId,
      referrer: referrer.id,
      landingUrl: originalUrl,
    })
    await updateAttributionSignup(sessionId, referrer.id, convertedUser.id)

    const [convertedRow] = await getSessionReferralAttributions(sessionId)
    expect(convertedRow!.signed_up_at).not.toBeNull()

    await createSessionReferralAttribution({
      sessionId,
      referrer: referrer.id,
      landingUrl: `https://example.com/converted-repeat-${uuidv7()}`,
    })

    const rows = await getSessionReferralAttributions(sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(convertedRow!.id)
    expect(rows[0]!.user_id).toBe(convertedUser.id)
    expect(rows[0]!.signed_up_at).toEqual(convertedRow!.signed_up_at)
    expect(rows[0]!.landing_url).toBe(originalUrl)
  })

  it('carries the prior user_id forward when a repeat click is signed out', async () => {
    const sessionId = uuidv7()
    const firstUrl = `https://example.com/signed-in-${uuidv7()}`
    const secondUrl = `https://example.com/signed-out-${uuidv7()}`

    await createSessionReferralAttribution({
      sessionId,
      referrer: referrer.id,
      landingUrl: firstUrl,
      userId: signedInUser.id,
    })
    const [firstClick] = await getSessionReferralAttributions(sessionId)
    expect(firstClick!.user_id).toBe(signedInUser.id)

    await createSessionReferralAttribution({
      sessionId,
      referrer: referrer.id,
      landingUrl: secondUrl,
      userId: null,
    })

    const rows = await getSessionReferralAttributions(sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.user_id).toBe(signedInUser.id)
    expect(rows[0]!.landing_url).toBe(secondUrl)
    // (id is a UUIDv7 string, not a number/bigint, so this can't use toBeGreaterThan.)
    const movedToLatest = rows[0]!.id > firstClick!.id
    expect(movedToLatest).toBe(true)
  })

  it('collapses a raced duplicate pair into one row on the next click', async () => {
    const sessionId = uuidv7()
    // Simulate the documented race: two concurrent requests for the same pair both
    // find no prior row and both insert, leaving two unconverted rows.
    await insertSessionReferralAttribution(sessionId, referrer.id, 'https://example.com/race-1')
    await insertSessionReferralAttribution(sessionId, referrer.id, 'https://example.com/race-2')
    expect(await getSessionReferralAttributions(sessionId)).toHaveLength(2)

    const landingUrl = `https://example.com/race-resolved-${uuidv7()}`
    await createSessionReferralAttribution({ sessionId, referrer: referrer.id, landingUrl })

    const rows = await getSessionReferralAttributions(sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.landing_url).toBe(landingUrl)
  })

  it("carries a raced duplicate row's user_id forward regardless of which row the DELETE returns first", async () => {
    const sessionId = uuidv7()
    // Simulate the documented race with one anonymous and one signed-in duplicate, anonymous
    // inserted first so it sorts first in the (session_id, id) index the DELETE scans.
    await insertSessionReferralAttribution(sessionId, referrer.id, 'https://example.com/race-anon')
    await insertSessionReferralAttribution(
      sessionId,
      referrer.id,
      'https://example.com/race-signed-in',
      signedInUser.id,
    )
    expect(await getSessionReferralAttributions(sessionId)).toHaveLength(2)

    const landingUrl = `https://example.com/race-resolved-user-${uuidv7()}`
    await createSessionReferralAttribution({ sessionId, referrer: referrer.id, landingUrl })

    const rows = await getSessionReferralAttributions(sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.user_id).toBe(signedInUser.id)
  })

  it('serializes a signed-in click behind an anonymous replacement and retains its owner', async () => {
    const sessionId = uuidv7()
    const pairLock = await acquireTestSessionReferralAttributionPairLock(sessionId, referrer.id)
    const anonymousReplacement = createSessionReferralAttribution({
      sessionId,
      referrer: referrer.id,
      landingUrl: `https://example.com/anonymous-replacement-${uuidv7()}`,
    })
    const signedInClick = createSessionReferralAttribution({
      sessionId,
      referrer: referrer.id,
      userId: signedInUser.id,
      landingUrl: `https://example.com/concurrent-signed-in-${uuidv7()}`,
    })

    try {
      await expect.poll(() => pairLock.hasWaiter()).toBe(true)
      expect(await getSessionReferralAttributions(sessionId)).toHaveLength(0)
    } finally {
      await pairLock.release()
    }

    await Promise.all([anonymousReplacement, signedInClick])
    const rows = await getSessionReferralAttributions(sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.user_id).toBe(signedInUser.id)
  })

  it('replaces an unconverted row whose prior owner is already deleted without carrying that user_id', async () => {
    const sessionId = uuidv7()
    const priorOwner = await createTestUserDirect()
    const firstUrl = `https://example.com/deleted-owner-${uuidv7()}`
    const secondUrl = `https://example.com/deleted-owner-repeat-${uuidv7()}`

    await createSessionReferralAttribution({
      sessionId,
      referrer: referrer.id,
      landingUrl: firstUrl,
      userId: priorOwner.id,
    })
    await softDeleteUser(priorOwner.id)

    await createSessionReferralAttribution({
      sessionId,
      referrer: referrer.id,
      landingUrl: secondUrl,
    })

    const rows = await getSessionReferralAttributions(sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.user_id).toBeNull()
    expect(rows[0]!.landing_url).toBe(secondUrl)
  })
})
