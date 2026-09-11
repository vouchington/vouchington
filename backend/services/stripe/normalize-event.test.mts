import { describe, expect, it } from 'vitest'
import type Stripe from 'stripe'
import { normalizeStripeEvent } from './normalize-event.mts'

describe('normalizeStripeEvent', () => {
  it('extracts only the invoice from InvoicePayment events', () => {
    const event = {
      created: 1_741_398_400,
      data: {
        object: {
          id: 'ip_test_123',
          object: 'invoice_payment',
          invoice: 'in_test_invoice_payment',
        },
      },
    } as Stripe.Event

    expect(normalizeStripeEvent(event)).toEqual({
      stripeCreatedAt: new Date(event.created * 1000),
      customerId: null,
      subscriptionId: null,
      invoiceId: 'in_test_invoice_payment',
      checkoutSessionId: null,
    })
  })

  it('extracts an expanded InvoicePayment invoice', () => {
    const event = {
      created: 1_741_398_400,
      data: {
        object: {
          id: 'ip_test_expanded',
          object: 'invoice_payment',
          invoice: { id: 'in_test_expanded_invoice_payment' },
        },
      },
    } as Stripe.Event

    expect(normalizeStripeEvent(event).invoiceId).toBe('in_test_expanded_invoice_payment')
  })
})
