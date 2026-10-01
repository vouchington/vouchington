import { describe, it, vi, afterEach } from 'vitest'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        put: vi.fn<VitestLooseMock>(),
        delete: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import {
  listUserPreservationHolds,
  placeUserPreservationHold,
  releaseUserPreservationHold,
} from '../preservation-holds'
import type { UserPreservationHold } from '@/types/api-responses'

const hold: UserPreservationHold = {
  id: 'hold-1',
  account_user_id: 'user-abc',
  reference: 'Matter 1',
  placed_by_id: 'admin-1',
  placed_at: '2026-09-01T00:00:00.000Z',
  released_by_id: null,
  released_at: null,
}

describe('preservation hold API client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('GETs /api/v1/users/:userId/preservation-hold', async () => {
    await expectApiWrapperCall({
      mock: vi.mocked(clientApi.get),
      response: { holds: [hold] },
      call: () => listUserPreservationHolds('user-abc'),
      expectedArgs: ['/api/v1/users/user-abc/preservation-hold'],
    })
  })

  it('PUTs the reference to /api/v1/users/:userId/preservation-hold', async () => {
    await expectApiWrapperCall({
      mock: vi.mocked(clientApi.put),
      response: { hold },
      call: () => placeUserPreservationHold('user-abc', { reference: 'Matter 1' }),
      expectedArgs: ['/api/v1/users/user-abc/preservation-hold', { reference: 'Matter 1' }],
    })
  })

  it('DELETEs /api/v1/users/:userId/preservation-hold', async () => {
    await expectApiWrapperCall({
      mock: vi.mocked(clientApi.delete),
      response: {
        hold: { ...hold, released_by_id: 'admin-1', released_at: '2026-09-02T00:00:00.000Z' },
      },
      call: () => releaseUserPreservationHold('user-abc'),
      expectedArgs: ['/api/v1/users/user-abc/preservation-hold'],
    })
  })
})
