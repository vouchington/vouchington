import { describe, expect, it } from 'vitest'
import {
  attachDerivedStatus,
  deriveDataRequestStatus,
  isActiveDataRequest,
} from './derive-status.mts'
import type { UserDataRequestRow } from './types.mts'

const baseRow: UserDataRequestRow = {
  id: '019c8390-0000-7000-8000-000000000001',
  user_id: '00000000-0000-7000-8000-000000000001',
  queued_at: new Date('2026-02-22T00:00:00.000Z'),
  processing_attempt_id: '019c8390-0000-7000-8000-000000000002',
  dispatched_at: new Date('2026-02-22T00:00:00.000Z'),
  processing_attempts: 0,
  processing_started_at: null,
  completed_at: null,
  failed_at: null,
  last_error_message: null,
  s3_key: null,
  expires_at: null,
  created_at: new Date('2026-02-22T00:00:00.000Z'),
  updated_at: new Date('2026-02-22T00:00:00.000Z'),
}

describe('deriveDataRequestStatus', () => {
  it('returns pending when only queued_at is set', () => {
    expect(deriveDataRequestStatus(baseRow)).toBe('pending')
  })

  it('returns processing when processing_started_at is set but not completed/failed', () => {
    expect(
      deriveDataRequestStatus({
        ...baseRow,
        processing_started_at: new Date('2026-02-22T00:01:00.000Z'),
      }),
    ).toBe('processing')
  })

  it('returns ready when completed with active s3_key and future expiry', () => {
    expect(
      deriveDataRequestStatus({
        ...baseRow,
        processing_started_at: new Date('2026-02-22T00:01:00.000Z'),
        completed_at: new Date('2026-02-22T00:02:00.000Z'),
        s3_key: 'exports/example.zip',
        expires_at: new Date(Date.now() + 60_000),
      }),
    ).toBe('ready')
  })

  it('returns ready when completed with active s3_key and no expiry deadline', () => {
    expect(
      deriveDataRequestStatus({
        ...baseRow,
        processing_started_at: new Date('2026-02-22T00:01:00.000Z'),
        completed_at: new Date('2026-02-22T00:02:00.000Z'),
        s3_key: 'exports/example.zip',
        expires_at: null,
      }),
    ).toBe('ready')
  })

  it('returns expired when completed but s3_key has been reclaimed', () => {
    expect(
      deriveDataRequestStatus({
        ...baseRow,
        processing_started_at: new Date('2026-02-22T00:01:00.000Z'),
        completed_at: new Date('2026-02-22T00:02:00.000Z'),
        s3_key: null,
        expires_at: new Date(Date.now() + 60_000),
      }),
    ).toBe('expired')
  })

  it('returns expired when completed and the deadline has passed', () => {
    expect(
      deriveDataRequestStatus({
        ...baseRow,
        processing_started_at: new Date('2026-02-22T00:01:00.000Z'),
        completed_at: new Date('2026-02-22T00:02:00.000Z'),
        s3_key: 'exports/example.zip',
        expires_at: new Date(Date.now() - 1_000),
      }),
    ).toBe('expired')
  })

  it('returns failed when failed_at is set, even if completed_at is also set', () => {
    expect(
      deriveDataRequestStatus({
        ...baseRow,
        processing_started_at: new Date('2026-02-22T00:01:00.000Z'),
        completed_at: new Date('2026-02-22T00:02:00.000Z'),
        failed_at: new Date('2026-02-22T00:03:00.000Z'),
        s3_key: 'exports/example.zip',
      }),
    ).toBe('failed')
  })

  it('returns failed when failed_at is set on an otherwise pending row', () => {
    expect(
      deriveDataRequestStatus({
        ...baseRow,
        failed_at: new Date('2026-02-22T00:01:00.000Z'),
      }),
    ).toBe('failed')
  })
})

describe('attachDerivedStatus', () => {
  it('returns the row with the derived status field', () => {
    const result = attachDerivedStatus({
      ...baseRow,
      processing_started_at: new Date('2026-02-22T00:01:00.000Z'),
    })
    expect(result.status).toBe('processing')
    expect(result.id).toBe(baseRow.id)
  })
})

describe('isActiveDataRequest', () => {
  it('returns true for pending', () => {
    expect(isActiveDataRequest(baseRow)).toBe(true)
  })

  it('returns true for processing', () => {
    expect(
      isActiveDataRequest({
        ...baseRow,
        processing_started_at: new Date('2026-02-22T00:01:00.000Z'),
      }),
    ).toBe(true)
  })

  it('returns false once completed', () => {
    expect(
      isActiveDataRequest({
        ...baseRow,
        processing_started_at: new Date('2026-02-22T00:01:00.000Z'),
        completed_at: new Date('2026-02-22T00:02:00.000Z'),
        s3_key: 'exports/example.zip',
      }),
    ).toBe(false)
  })

  it('returns false once failed', () => {
    expect(
      isActiveDataRequest({
        ...baseRow,
        failed_at: new Date('2026-02-22T00:01:00.000Z'),
      }),
    ).toBe(false)
  })
})
