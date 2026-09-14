import { afterEach, describe, expect, it, vi } from 'vitest'
import * as checkout from './checkout.mts'
import * as stripeClientModule from '@modules/stripe/client'
import * as customers from './customers.mts'
import * as identity from './identity.mts'
import * as invoices from './invoices.mts'
import * as portal from './portal.mts'
import * as refunds from './refunds.mts'
import * as subscriptions from './subscriptions.mts'
import {
  cancelSubscriptionAtPeriodEndOperation,
  cancelSubscriptionImmediatelyOperation,
  createBillingPortalSessionOperation,
  createIdentityCheckoutSessionOperation,
  createMembershipCheckoutSessionOperation,
  createRefundOperation,
  listSubscriptionInvoicesOperation,
  retrieveIdentityVerificationSessionUrlOperation,
  sanitizeCustomerOperation,
} from './operations.mts'

describe('Stripe operations', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a membership checkout workflow with stable customer and checkout idempotency keys', async () => {
    const getCustomer = vi
      .spyOn(customers, 'getOrCreateStripeCustomer')
      .mockResolvedValue({ id: 'cus_123' } as never)
    const createSession = vi.spyOn(checkout, 'createCheckoutSession').mockResolvedValue({
      id: 'cs_123',
      url: 'https://stripe.test/checkout',
    } as never)

    await expect(
      createMembershipCheckoutSessionOperation({
        userId: 'user_123',
        email: 'tests+7997@voucha.ai',
        priceId: 'price_123',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        purchaseIntentId: '01990f85-3491-7000-8000-000000000001',
        customerIdempotencyKey: 'customer-key',
        checkoutIdempotencyKey: 'checkout-key',
      }),
    ).resolves.toEqual({ id: 'cs_123', url: 'https://stripe.test/checkout' })
    expect(getCustomer).toHaveBeenCalledWith(
      'user_123',
      'tests+7997@voucha.ai',
      undefined,
      'customer-key',
    )
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cus_123',
        idempotencyKey: 'checkout-key',
        metadata: { membership_purchase_intent_id: '01990f85-3491-7000-8000-000000000001' },
      }),
    )
  })

  it('creates an identity checkout workflow with stable customer and checkout idempotency keys', async () => {
    vi.spyOn(customers, 'getOrCreateStripeCustomer').mockResolvedValue({
      id: 'cus_identity',
    } as never)
    const createSession = vi.spyOn(checkout, 'createOneTimeCheckoutSession').mockResolvedValue({
      id: 'cs_identity',
      url: null,
    } as never)

    await expect(
      createIdentityCheckoutSessionOperation({
        userId: 'user_identity',
        priceAmountMinorUnits: 2500,
        currency: 'usd',
        productName: 'Verification',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        metadata: { purpose: 'identity' },
        customerIdempotencyKey: 'identity-customer-key',
        checkoutIdempotencyKey: 'identity-checkout-key',
      }),
    ).resolves.toEqual({ id: 'cs_identity', url: null })
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cus_identity',
        metadata: { purpose: 'identity' },
        idempotencyKey: 'identity-checkout-key',
      }),
    )
  })

  it('maps portal, cancellation, identity URL, refund, and sanitization results to JSON-safe values', async () => {
    const createPortal = vi.spyOn(portal, 'createBillingPortalSession').mockResolvedValue({
      url: 'https://portal.test',
    } as never)
    const cancelAtPeriodEnd = vi
      .spyOn(subscriptions, 'cancelStripeSubscription')
      .mockResolvedValue({ id: 'sub_1' } as never)
    const cancelImmediately = vi
      .spyOn(subscriptions, 'cancelStripeSubscriptionImmediately')
      .mockResolvedValue({ id: 'sub_1' } as never)
    vi.spyOn(identity, 'stripeRetrieveVerificationSessionUrl').mockResolvedValue(
      'https://identity.test',
    )
    const createRefund = vi.spyOn(refunds, 'createStripeRefund').mockResolvedValue({
      id: 're_1',
      charge: { id: 'ch_1' },
      payment_intent: 'pi_1',
      amount: 500,
      currency: 'usd',
    } as never)
    const sanitizeCustomer = vi
      .spyOn(customers, 'sanitizeStripeCustomer')
      .mockResolvedValue({ id: 'cus_1' } as never)

    await expect(
      createBillingPortalSessionOperation({
        customerId: 'cus_1',
        returnUrl: 'https://example.com',
        idempotencyKey: 'portal-key',
      }),
    ).resolves.toEqual({ url: 'https://portal.test' })
    await expect(
      cancelSubscriptionAtPeriodEndOperation({
        subscriptionId: 'sub_1',
        idempotencyKey: 'later-key',
      }),
    ).resolves.toBeNull()
    await expect(
      cancelSubscriptionImmediatelyOperation({
        subscriptionId: 'sub_1',
      }),
    ).resolves.toBeNull()
    await expect(
      retrieveIdentityVerificationSessionUrlOperation({ sessionId: 'vs_1' }),
    ).resolves.toBe('https://identity.test')
    await expect(
      createRefundOperation({ chargeId: 'ch_1', idempotencyKey: 'refund-key' }),
    ).resolves.toEqual({
      id: 're_1',
      chargeId: 'ch_1',
      paymentIntentId: 'pi_1',
      amount: 500,
      currency: 'usd',
    })
    await expect(
      sanitizeCustomerOperation({ customerId: 'cus_1', idempotencyKey: 'sanitize-key' }),
    ).resolves.toBeNull()
    expect(createPortal).toHaveBeenCalledWith('cus_1', 'https://example.com', 'portal-key')
    expect(cancelAtPeriodEnd).toHaveBeenCalledWith('sub_1', 'later-key')
    expect(cancelImmediately).toHaveBeenCalledWith('sub_1')
    expect(createRefund).toHaveBeenCalledWith({
      chargeId: 'ch_1',
      idempotencyKey: 'refund-key',
    })
    expect(sanitizeCustomer).toHaveBeenCalledWith('cus_1', undefined, 'sanitize-key')
  })

  it('maps subscription invoices and payments to JSON-safe summaries', async () => {
    const list = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce({
        data: [
          {
            id: 'in_1',
            status: 'paid',
            amount_paid: 1200,
            currency: 'usd',
            created: 1_700_000_000,
            description: undefined,
            payments: {
              data: [
                {
                  amount_paid: 1200,
                  payment: { type: 'charge', charge: 'ch_1' },
                },
              ],
            },
          },
        ],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 'in_later',
            status: 'open',
            amount_paid: 0,
            currency: 'usd',
            created: 1_699_999_999,
            description: 'later invoice',
          },
        ],
        has_more: false,
      })
    const listInvoicePayments = vi.fn<VitestLooseMock>().mockResolvedValue({
      data: [],
      has_more: false,
    })
    const listLineItems = vi.fn<VitestLooseMock>().mockResolvedValue({
      data: [],
      has_more: false,
    })
    vi.spyOn(stripeClientModule, 'getStripeClient').mockReturnValue({
      invoicePayments: { list: listInvoicePayments },
      invoices: { list, listLineItems },
    } as never)

    await expect(
      listSubscriptionInvoicesOperation({ subscriptionId: 'sub_1', limit: 1 }),
    ).resolves.toEqual([
      {
        id: 'in_1',
        status: 'paid',
        amountPaid: 1200,
        currency: 'usd',
        created: 1_700_000_000,
        description: null,
        payments: [
          {
            amountPaid: 1200,
            payment: { type: 'charge', chargeId: 'ch_1', paymentIntentId: null },
          },
        ],
      },
    ])
    expect(list).toHaveBeenCalledOnce()
    expect(list).toHaveBeenCalledWith({
      subscription: 'sub_1',
      limit: 1,
      expand: ['data.payments'],
    })
    expect(listInvoicePayments).not.toHaveBeenCalled()
    expect(listLineItems).not.toHaveBeenCalled()
  })

  it('maps an invoice payment entry with no nested payment object safely', async () => {
    vi.spyOn(invoices, 'listStripeSubscriptionInvoices').mockResolvedValue({
      data: [
        {
          id: 'in_missing_payment',
          status: 'paid',
          amount_paid: 1200,
          currency: 'usd',
          created: 1_700_000_000,
          description: null,
          payments: { data: [{ amount_paid: 1200, payment: null }] },
        },
      ],
    } as never)

    const [invoice] = await listSubscriptionInvoicesOperation({
      subscriptionId: 'sub_1',
      limit: 100,
    })

    expect(invoice.payments).toEqual([
      {
        amountPaid: 1200,
        payment: { type: '', chargeId: null, paymentIntentId: null },
      },
    ])
  })
})
