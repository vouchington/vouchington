import { describe, expect, it } from 'vitest'
import { hydrateStripeEventRecord } from './event-record.mts'
import type { StripeEventRow } from './events-types.mts'

const baseRow: StripeEventRow = {
  id: '01912345-1234-7234-8234-123456789abc',
  stripe_event_id: 'evt_test_record',
  event_type: 'invoice.paid',
  livemode: false,
  api_version: '2025-09-30.clover',
  stripe_created_at: new Date('2026-01-01T00:00:00.000Z'),
  customer_id: 'cus_test_record',
  subscription_id: 'sub_test_record',
  invoice_id: 'in_test_record',
  checkout_session_id: null,
  received_at: new Date('2026-01-01T00:00:01.000Z'),
  processing_attempt_id: '01912345-1234-7234-8234-123456789abd',
  dispatched_at: new Date('2026-01-01T00:00:01.000Z'),
  processing_started_at: null,
  processing_attempts: 0,
  processed_at: null,
  ignored_at: null,
  failed_at: null,
  last_error_at: null,
  last_error_message: null,
  payload: { id: 'evt_test_record', object: 'event' },
  created_at: new Date('2026-01-01T00:00:01.000Z'),
}

describe('hydrateStripeEventRecord', () => {
  it.each([
    ['received', {}],
    ['processing', { processing_started_at: new Date('2026-01-01T00:00:02.000Z') }],
    ['processed', { processed_at: new Date('2026-01-01T00:00:03.000Z') }],
    ['ignored', { ignored_at: new Date('2026-01-01T00:00:04.000Z') }],
    ['failed', { failed_at: new Date('2026-01-01T00:00:05.000Z') }],
  ] as const)('derives %s status from lifecycle timestamps', (status, rowOverrides) => {
    expect(hydrateStripeEventRecord({ ...baseRow, ...rowOverrides }).status).toBe(status)
  })

  it('preserves insert metadata when hydrating inserted rows', () => {
    const hydrated = hydrateStripeEventRecord({ ...baseRow, is_new: true })

    expect(hydrated.is_new).toBe(true)
    expect(hydrated.payload.id).toBe('evt_test_record')
  })
})
