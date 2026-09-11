import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        delete: vi.fn<VitestLooseMock>(),
        get: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
        put: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import {
  adminCreateCuratedAside,
  adminDeleteCuratedAside,
  adminListCuratedAsides,
  adminReorderCuratedAsides,
} from '../admin-curated-asides'
import { clientApi } from '../instance'

const mockDelete = vi.mocked(clientApi.delete)
const mockGet = vi.mocked(clientApi.get)
const mockPost = vi.mocked(clientApi.post)
const mockPut = vi.mocked(clientApi.put)

describe('admin curated asides client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('GETs admin curated asides with an encoded type query', async () => {
    mockGet.mockResolvedValueOnce({ curated_aside_items: [] })

    const result = await adminListCuratedAsides('source & topic')

    expect(mockGet).toHaveBeenCalledWith('/api/v1/curated-aside-items?type=source%20%26%20topic')
    expect(result).toEqual({ curated_aside_items: [] })
  })

  it('POSTs admin curated aside creation data', async () => {
    mockPost.mockResolvedValueOnce({ curated_aside_item: { id: 'item-1' } })
    const payload = {
      aside_type: 'topic',
      entity_id: 'entity-1',
      position: 2,
    }

    const result = await adminCreateCuratedAside(payload)

    expect(mockPost).toHaveBeenCalledWith('/api/v1/curated-aside-items', payload)
    expect(result).toEqual({ curated_aside_item: { id: 'item-1' } })
  })

  it('DELETEs an admin curated aside item by id', async () => {
    mockDelete.mockResolvedValueOnce(undefined)

    await adminDeleteCuratedAside('item-1')

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/curated-aside-items/item-1')
  })

  it('PUTs admin curated aside reorder data', async () => {
    mockPut.mockResolvedValueOnce(undefined)

    await adminReorderCuratedAsides('community', ['item-2', 'item-1'])

    expect(mockPut).toHaveBeenCalledWith('/api/v1/curated-aside-items/order', {
      aside_type: 'community',
      item_ids: ['item-2', 'item-1'],
    })
  })
})
