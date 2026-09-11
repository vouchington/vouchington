import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import { getMembershipHistory } from './get.mts'
import { refundMembership, type MembershipStripeOperations } from './refund-membership.mts'
import { createStripeRefundIdempotencyKey } from './refund-idempotency.mts'
import { getMembershipRefunds, recordMembershipRefundWebhook } from './refunds.mts'

const mockInvoicesList = vi.fn<MembershipStripeOperations['listSubscriptionInvoices']>()
const mockRefundsCreate = vi.fn<MembershipStripeOperations['createRefund']>()
const mockSubsCancel = vi.fn<MembershipStripeOperations['cancelSubscriptionImmediately']>()

function stripeOperations(): MembershipStripeOperations {
  return {
    listSubscriptionInvoices: mockInvoicesList,
    createRefund: mockRefundsCreate,
    cancelSubscriptionImmediately: mockSubsCancel,
  }
}

function fakeInvoice(chargeId: string | null, piId: string | null) {
  return [
    {
      status: 'paid',
      id: 'in_test',
      amountPaid: 1000,
      currency: 'usd',
      created: 1700000000,
      description: null,
      payments: [
        {
          amountPaid: 1000,
          payment: chargeId
            ? { type: 'charge', chargeId, paymentIntentId: null }
            : { type: 'payment_intent', chargeId: null, paymentIntentId: piId },
        },
      ],
    },
  ]
}

async function waitForBarrier(barrier: Promise<void>, name: string): Promise<void> {
  const signal = AbortSignal.timeout(5000)
  const timedOut = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error(`Timed out waiting for ${name}`)), {
      once: true,
    })
  })
  await Promise.race([barrier, timedOut])
}

describe('membership refund concurrency', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('converges concurrent exact refunds after the winner commits during invoice listing', async () => {
    const actor = await createTestUser()
    const target = await createTestUser()
    const uniqueId = randomUUID()
    const chargeId = `ch_exact_race_${uniqueId}`
    const subscriptionId = `sub_exact_race_${uniqueId}`
    const stripeRefundId = `re_exact_race_${uniqueId}`
    const membership = await createTestMembership({
      user_id: target.id,
      stripe_subscription_id: subscriptionId,
    })
    let invoiceListCallCount = 0
    let signalFirstInvoiceList!: () => void
    let signalSecondInvoiceList!: () => void
    let releaseSecondInvoiceList!: () => void
    const firstInvoiceListStarted = new Promise<void>(resolve => {
      signalFirstInvoiceList = resolve
    })
    const secondInvoiceListStarted = new Promise<void>(resolve => {
      signalSecondInvoiceList = resolve
    })
    const secondInvoiceListMayReturn = new Promise<void>(resolve => {
      releaseSecondInvoiceList = resolve
    })
    mockInvoicesList.mockImplementation(async () => {
      invoiceListCallCount++
      if (invoiceListCallCount === 1) {
        signalFirstInvoiceList()
        await waitForBarrier(secondInvoiceListStarted, 'the replay invoice-list request')
      } else {
        signalSecondInvoiceList()
        await waitForBarrier(secondInvoiceListMayReturn, 'the winner refund receipt')
      }
      return fakeInvoice(chargeId, null)
    })
    mockRefundsCreate.mockResolvedValue({
      id: stripeRefundId,
      chargeId,
      paymentIntentId: null,
      amount: 1000,
      currency: 'usd',
    })
    mockSubsCancel.mockResolvedValue(null)
    const options = {
      targetUserId: target.id,
      chargeId,
      paymentIntentId: null,
      invoiceId: 'in_test',
      reason: 'requested' as const,
      cancel: true,
      note: 'concurrent exact refund',
      idempotencyToken: randomUUID(),
    }
    const stripeIdempotencyKey = createStripeRefundIdempotencyKey(
      actor.id,
      options.idempotencyToken,
    )

    const winnerRequest = refundMembership(actor.id, options, stripeOperations())
    await waitForBarrier(firstInvoiceListStarted, 'the winner invoice-list request')
    const replayRequest = refundMembership(actor.id, options, stripeOperations())
    await waitForBarrier(secondInvoiceListStarted, 'the replay invoice-list request')
    const winner = await winnerRequest
    releaseSecondInvoiceList()
    const replay = await replayRequest
    const receipts = (await getMembershipRefunds(target.id)).filter(
      refund =>
        refund.membership_id === membership.id &&
        refund.stripe_idempotency_key === stripeIdempotencyKey,
    )
    const refundChanges = (await getMembershipHistory(target.id)).filter(
      change => change.membership_id === membership.id && change.change_type === 'refund',
    )

    expect(replay).toEqual(winner)
    expect(winner.revoked_access).toBe(true)
    expect(mockRefundsCreate).toHaveBeenCalledOnce()
    expect(mockRefundsCreate).toHaveBeenCalledWith({
      chargeId,
      paymentIntentId: undefined,
      amountMinorUnits: undefined,
      idempotencyKey: stripeIdempotencyKey,
    })
    expect(mockSubsCancel).toHaveBeenCalledOnce()
    expect(mockSubsCancel).toHaveBeenCalledWith({ subscriptionId })
    expect(receipts).toHaveLength(1)
    expect(refundChanges).toHaveLength(1)
  })

  it('atomically rejects concurrent changed intent without overwriting or cancelling', async () => {
    const user = await createTestUser()
    const uniqueId = Math.random().toString(36).slice(2, 10)
    const chargeId = `ch_intent_race_${uniqueId}`
    const refundResult = {
      id: `re_intent_race_${uniqueId}`,
      chargeId,
      paymentIntentId: null,
      amount: 300,
      currency: 'usd',
    }
    const membership = await createTestMembership({
      user_id: user.id,
      stripe_subscription_id: `sub_intent_race_${uniqueId}`,
    })
    mockInvoicesList.mockResolvedValue(fakeInvoice(chargeId, null))
    let releaseFirstResponse!: () => void
    let markFirstStripeCall!: () => void
    const firstStripeCall = new Promise<void>(resolve => {
      markFirstStripeCall = resolve
    })
    const firstResponseMayReturn = new Promise<void>(resolve => {
      releaseFirstResponse = resolve
    })
    mockRefundsCreate.mockImplementation(async () => {
      markFirstStripeCall()
      await firstResponseMayReturn
      return refundResult
    })
    const idempotencyToken = randomUUID()
    const firstRequest = refundMembership(
      user.id,
      {
        targetUserId: user.id,
        chargeId,
        paymentIntentId: null,
        invoiceId: 'in_test',
        reason: 'goodwill',
        cancel: false,
        amount: { amount: 300, currency: 'usd' },
        note: 'first intent',
        idempotencyToken,
      },
      stripeOperations(),
    )
    await firstStripeCall
    await recordMembershipRefundWebhook({
      membershipId: membership.id,
      membershipSourceId: membership.membership_source_id,
      userId: user.id,
      stripeRefundId: refundResult.id,
      stripeChargeId: chargeId,
      stripePaymentIntentId: null,
      amount: { amount: 300, currency: 'usd' },
      stripeEventId: `evt_intent_race_${uniqueId}`,
    })
    const changedRequest = refundMembership(
      user.id,
      {
        targetUserId: user.id,
        chargeId,
        paymentIntentId: null,
        invoiceId: 'in_test',
        reason: 'dispute',
        cancel: true,
        amount: { amount: 300, currency: 'usd' },
        note: 'changed intent',
        idempotencyToken,
      },
      stripeOperations(),
    )

    await expect(changedRequest).rejects.toMatchObject({ status: 409 })
    releaseFirstResponse()
    const firstResult = await firstRequest

    expect(firstResult.reason).toBe('goodwill')
    expect(firstResult.note).toBe('first intent')
    expect(mockRefundsCreate).toHaveBeenCalledOnce()
    expect(mockSubsCancel).not.toHaveBeenCalled()
  })

  it('records one refund audit change for concurrent exact cancellation replays', async () => {
    const user = await createTestUser()
    const uniqueId = Math.random().toString(36).slice(2, 10)
    const chargeId = `ch_cancel_race_${uniqueId}`
    const membership = await createTestMembership({
      user_id: user.id,
      stripe_subscription_id: `sub_cancel_race_${uniqueId}`,
    })
    mockInvoicesList.mockResolvedValue(fakeInvoice(chargeId, null))
    mockRefundsCreate.mockResolvedValue({
      id: `re_cancel_race_${uniqueId}`,
      chargeId,
      paymentIntentId: null,
      amount: 1000,
      currency: 'usd',
    })
    let cancellationArrivals = 0
    let releaseCancellations!: () => void
    const bothCancellationsArrived = new Promise<void>(resolve => {
      releaseCancellations = resolve
    })
    mockSubsCancel.mockImplementation(async () => {
      cancellationArrivals++
      if (cancellationArrivals === 2) releaseCancellations()
      await bothCancellationsArrived
      return null
    })
    const options = {
      targetUserId: user.id,
      chargeId,
      paymentIntentId: null,
      invoiceId: 'in_test',
      reason: 'requested' as const,
      cancel: true,
      note: 'single cancellation audit',
      idempotencyToken: randomUUID(),
    }

    const results = await Promise.all([
      refundMembership(user.id, options, stripeOperations()),
      refundMembership(user.id, options, stripeOperations()),
    ])
    const refundChanges = (await getMembershipHistory(user.id)).filter(
      change => change.membership_id === membership.id && change.change_type === 'refund',
    )

    expect(results.every(result => result.revoked_access)).toBe(true)
    expect(mockSubsCancel).toHaveBeenCalledTimes(2)
    expect(refundChanges).toHaveLength(1)
  })
})
