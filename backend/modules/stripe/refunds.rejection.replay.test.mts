import { describe, expect, it } from 'vitest'
import {
  createTestConcurrentStripeRefundRejections,
  createTestStripeRefundRejection,
} from '../../test-helpers/stripe-refund-rejection.mts'
import { getStripeRefundRequestRejection } from './refund-request-errors.mts'

describe('refund pre-execution proof through the Stripe SDK', () => {
  it('confirms a single provider validation rejection but preserves an unknown closed-connection execution before a rejection', async () => {
    const rejected = await createTestStripeRefundRejection()
    expect(getStripeRefundRequestRejection(rejected)).toBe('invalid_parameters')
    const unknown = await createTestStripeRefundRejection({ priorUnknownExecution: true })
    expect(getStripeRefundRequestRejection(unknown)).toBeNull()
  })
  it('keeps overlapping same-key executions unknown and isolates different provider keys', async () => {
    const sameKey = await createTestConcurrentStripeRefundRejections(true)
    expect(sameKey.map(getStripeRefundRequestRejection)).toEqual([null, null])
    const differentKeys = await createTestConcurrentStripeRefundRejections(false)
    expect(differentKeys.map(getStripeRefundRequestRejection)).toEqual([
      'invalid_parameters',
      'invalid_parameters',
    ])
  })
})
