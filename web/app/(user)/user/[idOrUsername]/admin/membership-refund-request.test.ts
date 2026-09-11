import { describe, expect, it } from 'vitest'
import { createRefundRequest } from './membership-refund-request'
import type { RefundableCharge } from '@/types/api-responses'

const charge: RefundableCharge = {
  charge_id: 'ch_1',
  payment_intent_id: 'pi_1',
  invoice_id: 'in_1',
  amount: { amount: 10_000, currency: 'usd' },
  amount_refunded: { amount: 0, currency: 'usd' },
  created_at: '2026-07-25T00:00:00.000Z',
  description: null,
}

describe('createRefundRequest', () => {
  it('parses the active locale decimal separator exactly', () => {
    expect(
      createRefundRequest(
        'user-1',
        charge,
        { reason: 'requested', cancel: false, amountStr: '12,34', note: '' },
        'pt',
      ),
    ).toMatchObject({
      amount: { amount: 1234, currency: 'usd' },
    })
  })

  it('rejects a zero partial refund before it reaches the API', () => {
    expect(() =>
      createRefundRequest(
        'user-1',
        charge,
        { reason: 'requested', cancel: false, amountStr: '0,00', note: '' },
        'fr',
      ),
    ).toThrow(/^Refund amount must be greater than zero$/)
  })

  it('rejects grouping separators instead of stripping them', () => {
    expect(() =>
      createRefundRequest(
        'user-1',
        charge,
        { reason: 'requested', cancel: false, amountStr: '12.345,67', note: '' },
        'pt',
      ),
    ).toThrow(/^Money must be a non-negative plain decimal string$/)
  })
})
