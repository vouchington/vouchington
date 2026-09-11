import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { enqueuePsqlJob, fetchMigrations, fetchPartitions } from '../psql'
import { clearCache, fetchCacheGroups, flushValkey, rebuildBloomFilter } from '../valkey'

const mockGet = vi.mocked(clientApi.get)
const mockPost = vi.mocked(clientApi.post)

describe('psql client helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('GETs migrations through the client request helper', async () => {
    const response = { applied: ['0000-00-00-core-functions-sites.sql'], pending: [], total: 1 }
    mockGet.mockResolvedValueOnce(response)

    await expect(fetchMigrations()).resolves.toBe(response)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/psql/migrations')
  })

  it('GETs partitions through the client request helper', async () => {
    const response = { tables: [] }
    mockGet.mockResolvedValueOnce(response)

    await expect(fetchPartitions()).resolves.toBe(response)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/psql/partitions')
  })

  it('POSTs psql jobs with the requested job type', async () => {
    const response = { success: true }
    mockPost.mockResolvedValueOnce(response)

    await expect(enqueuePsqlJob('runConfigDriven')).resolves.toBe(response)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/psql/jobs', { type: 'runConfigDriven' })
  })
})

describe('valkey client helpers', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('POSTs bloom filter rebuild requests through the client helper', async () => {
    const response = { success: true, filter: 'entity-cache' }
    mockPost.mockResolvedValueOnce(response)

    await expect(rebuildBloomFilter('entity-cache')).resolves.toBe(response)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/valkey/bloom-filters/rebuild', {
      filter: 'entity-cache',
    })
  })

  it('GETs cache groups through the client request helper', async () => {
    const response = { groups: [] }
    mockGet.mockResolvedValueOnce(response)

    await expect(fetchCacheGroups()).resolves.toBe(response)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/valkey/cache-groups')
  })

  it('POSTs cache clear requests with the selected group', async () => {
    const response = { success: true, group: 'posts' }
    mockPost.mockResolvedValueOnce(response)

    await expect(clearCache('posts')).resolves.toBe(response)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/valkey/caches/clear', { group: 'posts' })
  })

  it('POSTs flush requests with the selected concern', async () => {
    const response = { concern: 'blooms', keysRemoved: 12 }
    mockPost.mockResolvedValueOnce(response)

    await expect(flushValkey('blooms')).resolves.toBe(response)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/valkey/flush', { concern: 'blooms' })
  })

  it('POSTs flush requests with force when flushing sessions', async () => {
    const response = { concern: 'sessions', keysRemoved: null }
    mockPost.mockResolvedValueOnce(response)

    await expect(flushValkey('sessions', true)).resolves.toBe(response)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/valkey/flush', {
      concern: 'sessions',
      force: true,
    })
  })
})
