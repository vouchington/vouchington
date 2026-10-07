import { beforeEach, describe, expect, it, vi } from 'vitest'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

const { mockGet, mockReturnNullForMissingEntity } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
  mockReturnNullForMissingEntity: vi.fn<VitestLooseMock>(
    async (promise: Promise<unknown>) => promise,
  ),
}))

vi.mock(
  import('./instance'),
  () => ({ serverApi: { get: mockGet } }) as unknown as typeof import('./instance'),
)

vi.mock(import('../return-null-for-missing-entity'), () => ({
  returnNullForMissingEntity: mockReturnNullForMissingEntity,
}))

import { getUserPreservationHoldState } from './preservation-holds'

describe('preservation hold server API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('GETs the UUID route and preserves null-on-404 handling', async () => {
    const response = { account_deleted_at: '2026-09-01T00:00:00.000Z', holds: [] }

    await expectApiWrapperCall({
      mock: mockGet,
      response,
      call: () => getUserPreservationHoldState('018f47a0-25cb-7a45-8b54-304f77ce64c0'),
      expectedArgs: ['/api/v1/users/018f47a0-25cb-7a45-8b54-304f77ce64c0/preservation-hold'],
    })
    expect(mockReturnNullForMissingEntity).toHaveBeenCalledTimes(1)
  })
})
