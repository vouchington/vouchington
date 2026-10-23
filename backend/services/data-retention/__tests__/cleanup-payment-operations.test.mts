import { describe, expect, it, onTestFinished } from 'vitest'
import { createStripeEvent } from '@voucha/test-helpers/membership-stripe-fixtures'
import {
  seedStripeEventRetentionWork,
  stripeEventWorkExists,
  seedMembershipPurchaseIntentForRetention,
  membershipPurchaseIntentExists,
  acquirePaymentOperationRetentionTestLock,
  resetPaymentOperationRetentionCursors,
  deletePaymentOperationRetentionCursor,
  getPaymentOperationRetentionCursorId,
  getMembershipPurchaseIntentExpiredAt,
} from '@voucha/test-helpers/payment-operation-retention'
import { createMembershipPurchaseIntentFixture } from '@voucha/test-helpers/data-stores/psql/membership-purchase-intents'
import {
  createMembershipProviderEvidence,
  createMembershipVerification,
} from '@voucha/test-helpers/data-stores/psql/membership-verifications'
import { randomUUID } from 'node:crypto'
import { getStripeEventByStripeEventId } from '../../stripe/events.mts'
import { insertStripeEvent } from '../../stripe/insert-event.mts'
import { handleStripeEvent } from '../../stripe-event-processing/event-handlers.mts'
import {
  cleanupAbandonedMembershipPurchaseIntents,
  cleanupTerminalStripeEventWork,
} from '../cleanup-payment-operations.mts'

const DAY_MS = 24 * 60 * 60 * 1000

function ownedWindow(now: Date) {
  const createdAt = new Date(now.getTime() - 40 * DAY_MS)
  return {
    createdAt,
    lowerBoundDate: createdAt,
    upperBoundDate: new Date(createdAt.getTime() + 4),
  }
}

describe('payment operational retention', () => {
  it('resumes a capped terminal Stripe page and deduplicates replay from the retained ledger', async () => {
    const lock = await acquirePaymentOperationRetentionTestLock()
    onTestFinished(() => lock.release())
    await resetPaymentOperationRetentionCursors()
    const now = new Date()
    const window = ownedWindow(now)
    const firstEvent = createStripeEvent('invoice.paid', { id: randomUUID(), object: 'invoice' })
    const secondEvent = createStripeEvent('invoice.paid', { id: randomUUID(), object: 'invoice' })
    const firstId = await seedStripeEventRetentionWork(
      firstEvent,
      window.createdAt,
      window.createdAt,
    )
    const secondId = await seedStripeEventRetentionWork(
      secondEvent,
      new Date(window.createdAt.getTime() + 1),
      new Date(window.createdAt.getTime() + 1),
    )
    const recentEvent = createStripeEvent('invoice.paid', { id: randomUUID(), object: 'invoice' })
    const recentId = await seedStripeEventRetentionWork(
      recentEvent,
      new Date(window.createdAt.getTime() + 2),
      now,
    )
    const pendingEvent = createStripeEvent('invoice.paid', { id: randomUUID(), object: 'invoice' })
    const pendingId = await seedStripeEventRetentionWork(
      pendingEvent,
      new Date(window.createdAt.getTime() + 3),
      null,
    )

    const options = { ...window, now, batchSize: 1 }
    await deletePaymentOperationRetentionCursor('stripe_event_work')
    const first = await cleanupTerminalStripeEventWork(options)
    expect(await getPaymentOperationRetentionCursorId('stripe_event_work')).toBe(first.cursorId)
    const second = await cleanupTerminalStripeEventWork(options)
    const third = await cleanupTerminalStripeEventWork(options)

    expect(first).toMatchObject({ deleted: 1, hasMore: true })
    expect(first.cursorId).not.toBeNull()
    expect(second).toMatchObject({ deleted: 1, hasMore: true })
    expect(third).toEqual({ deleted: 0, hasMore: false, cursorId: null })
    expect(await stripeEventWorkExists(firstId)).toBe(false)
    expect(await stripeEventWorkExists(secondId)).toBe(false)
    expect(await stripeEventWorkExists(recentId)).toBe(true)
    expect(await stripeEventWorkExists(pendingId)).toBe(true)
    const replay = await insertStripeEvent(firstEvent)
    expect(replay).toMatchObject({ is_new: false, status: 'retained', lease_token: null })
    expect(await getStripeEventByStripeEventId(firstEvent.id)).toMatchObject({ status: 'retained' })
  })

  it('deletes abandoned, failed, ownerless and expired Checkout intents while preserving live and verified intents', async () => {
    const lock = await acquirePaymentOperationRetentionTestLock()
    onTestFinished(() => lock.release())
    await resetPaymentOperationRetentionCursors()
    const now = new Date()
    const window = ownedWindow(now)
    const fixture = await createMembershipPurchaseIntentFixture('retention')
    const expiresAt = new Date(window.createdAt.getTime() + 30 * 60_000)
    const abandonedId = await seedMembershipPurchaseIntentForRetention(
      fixture,
      window.createdAt,
      expiresAt,
      'unlaunched',
    )
    const failedId = await seedMembershipPurchaseIntentForRetention(
      fixture,
      window.createdAt,
      expiresAt,
      'failed',
    )
    const launchedId = await seedMembershipPurchaseIntentForRetention(
      fixture,
      window.createdAt,
      expiresAt,
      'launched',
    )
    const expiredCheckoutId = `cs_expired_${randomUUID()}`
    const expiredCheckoutIntentId = await seedMembershipPurchaseIntentForRetention(
      fixture,
      window.createdAt,
      expiresAt,
      'launched',
      { checkoutId: expiredCheckoutId },
    )
    await handleStripeEvent(
      createStripeEvent('checkout.session.expired', {
        id: expiredCheckoutId,
        mode: 'subscription',
      }),
      undefined,
      { applicationId: fixture.applicationId },
    )
    expect(await getMembershipPurchaseIntentExpiredAt(expiredCheckoutIntentId)).toBeInstanceOf(Date)
    const ownerlessId = await seedMembershipPurchaseIntentForRetention(
      fixture,
      window.createdAt,
      expiresAt,
      'launched',
      { ownerless: true, checkoutId: `cs_ownerless_${randomUUID()}` },
    )
    const notYetExpiredId = await seedMembershipPurchaseIntentForRetention(
      fixture,
      window.createdAt,
      new Date(now.getTime() + DAY_MS),
      'unlaunched',
    )
    const verifiedId = await seedMembershipPurchaseIntentForRetention(
      fixture,
      window.createdAt,
      expiresAt,
      'failed',
    )
    const evidenceId = await createMembershipProviderEvidence(fixture)
    await createMembershipVerification(fixture, verifiedId, evidenceId, randomUUID())

    await deletePaymentOperationRetentionCursor('purchase_intent')
    const result = await cleanupAbandonedMembershipPurchaseIntents({
      ...window,
      now,
      batchSize: 10,
    })

    expect(result).toEqual({ deleted: 4, hasMore: false, cursorId: null })
    expect(await getPaymentOperationRetentionCursorId('purchase_intent')).toBeNull()
    expect(await membershipPurchaseIntentExists(abandonedId)).toBe(false)
    expect(await membershipPurchaseIntentExists(failedId)).toBe(false)
    expect(await membershipPurchaseIntentExists(launchedId)).toBe(true)
    expect(await membershipPurchaseIntentExists(expiredCheckoutIntentId)).toBe(false)
    expect(await membershipPurchaseIntentExists(ownerlessId)).toBe(false)
    expect(await membershipPurchaseIntentExists(notYetExpiredId)).toBe(true)
    expect(await membershipPurchaseIntentExists(verifiedId)).toBe(true)
  })
})
