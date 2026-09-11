import { describe, expect, it } from 'vitest'
import { ACTIVITYPUB_INBOX_STORAGE_POLICY } from '@modules/activitypub-inbox-storage-policy'
import { mapActivityPubInboxCapacityErrorOrThrow } from './durable-delivery-transition-intake.mts'

describe('ActivityPub inbox intake capacity classification', () => {
  it('maps the named PostgreSQL constraint and reports every exceeded dimension', () => {
    expect(
      mapActivityPubInboxCapacityErrorOrThrow({
        code: '23514',
        constraint: 'ap_inbox_deliveries_unverified_capacity',
        detail: JSON.stringify({
          unverifiedRows: ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumUnverifiedRows,
          unverifiedRawBodyBytes: ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumUnverifiedRawBodyBytes,
          attemptedRows: 1,
          attemptedRawBodyBytes: 4,
        }),
      }),
    ).toEqual({
      outcome: 'capacity-exceeded',
      value: {
        snapshot: {
          unverifiedRows: ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumUnverifiedRows,
          unverifiedRawBodyBytes: ACTIVITYPUB_INBOX_STORAGE_POLICY.maximumUnverifiedRawBodyBytes,
        },
        attemptedRows: 1,
        attemptedRawBodyBytes: 4,
        limitingDimensions: ['rows', 'raw-body-bytes'],
      },
    })
  })

  it.each([
    new Error('database unavailable'),
    { code: '23514', constraint: 'another_constraint', detail: '{}' },
  ])('rethrows non-capacity database errors', error => {
    expect(() => mapActivityPubInboxCapacityErrorOrThrow(error)).toThrow(error)
  })

  it.each(['not JSON', '{}'])(
    'preserves the PostgreSQL capacity error when DETAIL is invalid: %s',
    detail => {
      const error = Object.assign(new Error('capacity exceeded'), {
        code: '23514',
        constraint: 'ap_inbox_deliveries_unverified_capacity',
        detail,
      })

      expect(() => mapActivityPubInboxCapacityErrorOrThrow(error)).toThrow(error)
    },
  )
})
