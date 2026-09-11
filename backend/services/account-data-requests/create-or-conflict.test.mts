import { describe, expect, it, vi } from 'vitest'
import type { UserDataRequest } from './types.mts'
import { createDataRequestOrConflict } from './create-or-conflict.mts'

const buildRequest = (overrides: Partial<UserDataRequest> = {}): UserDataRequest => ({
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
  status: 'pending',
  created_at: new Date('2026-02-22T00:00:00.000Z'),
  updated_at: new Date('2026-02-22T00:00:00.000Z'),
  ...overrides,
})

describe('createDataRequestOrConflict', () => {
  it('returns conflict when insert races and hits active unique index (23505)', async () => {
    const existing = buildRequest({ status: 'pending' })
    const getLatestDataRequest = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing)
    const createDataRequest = vi.fn<VitestLooseMock>().mockRejectedValueOnce({
      code: '23505',
      constraint: 'idx_user_data_requests__active_per_user',
    })

    const result = await createDataRequestOrConflict(existing.user_id!, {
      createDataRequest,
      getLatestDataRequest,
    })

    expect(result).toEqual({ type: 'conflict', existing })
    expect(getLatestDataRequest).toHaveBeenCalledTimes(2)
    expect(createDataRequest).toHaveBeenCalledTimes(1)
  })

  it('returns null conflict metadata when the follow-up read is no longer active', async () => {
    const latest = buildRequest({
      status: 'failed',
      failed_at: new Date('2026-02-22T00:01:00.000Z'),
    })
    const getLatestDataRequest = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(latest)
    const createDataRequest = vi.fn<VitestLooseMock>().mockRejectedValueOnce({
      code: '23505',
      constraint: 'idx_user_data_requests__active_per_user',
    })

    const result = await createDataRequestOrConflict(latest.user_id!, {
      createDataRequest,
      getLatestDataRequest,
    })

    expect(result).toEqual({ type: 'conflict', existing: null })
    expect(getLatestDataRequest).toHaveBeenCalledTimes(2)
  })

  it('rethrows non-conflict insert errors', async () => {
    const getLatestDataRequest = vi.fn<VitestLooseMock>().mockResolvedValueOnce(null)
    const createDataRequest = vi.fn<VitestLooseMock>().mockRejectedValueOnce(new Error('boom'))

    await expect(
      createDataRequestOrConflict('00000000-0000-7000-8000-000000000002', {
        createDataRequest,
        getLatestDataRequest,
      }),
    ).rejects.toThrow('boom')
  })
})
