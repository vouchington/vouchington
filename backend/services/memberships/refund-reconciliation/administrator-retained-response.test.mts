import { describe, expect, it } from 'vitest'
import { decodeAdministratorRetainedResponse } from './administrator-retained-response.mts'

describe('retained administrator refund response validation', () => {
  it.each([null, undefined, [], 'completed'])(
    'rejects a non-record historical snapshot %s',
    value => {
      expect(() => decodeAdministratorRetainedResponse(value)).toThrow(
        'Invalid retained administrator refund response',
      )
    },
  )
  it.each([
    { refundId: 'not-a-refund-identity', cancellationStatus: 'completed' },
    { refundId: crypto.randomUUID(), cancellationStatus: 'pending' },
  ])('rejects a forged refund identity or cancellation outcome', value => {
    expect(() => decodeAdministratorRetainedResponse(value)).toThrow(
      'Invalid retained administrator refund response',
    )
  })
})
