import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
        patch: vi.fn<VitestLooseMock>(),
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { createHostname, fetchHostnames, updateHostname } from '../hostnames'

const mockGet = vi.mocked(clientApi.get)
const mockPatch = vi.mocked(clientApi.patch)
const mockPost = vi.mocked(clientApi.post)

describe('hostnames client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('fetches hostnames with query options and signal', async () => {
    const signal = new AbortController().signal
    const response = { hostnames: {}, page_info: { has_next_page: false } }
    mockGet.mockResolvedValueOnce(response)

    const result = await fetchHostnames({ q: 'example', limit: 10, signal })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/hostnames', {
      searchParams: { query: 'example', limit: 10 },
      signal,
    })
    expect(result).toBe(response)
  })

  it('returns the block result when marking a hostname blocked', async () => {
    const response = { blocked_hostname_ids: ['hostname-1'], affected_user_ids: [] }
    mockPatch.mockResolvedValueOnce(response)

    const result = await updateHostname('hostname-1', { blocked: true })

    expect(mockPatch).toHaveBeenCalledWith('/api/v1/hostnames/hostname-1', { blocked: true })
    expect(result).toBe(response)
  })

  it('returns null after non-blocking hostname updates', async () => {
    mockPatch.mockResolvedValueOnce(undefined)

    const result = await updateHostname('hostname-1', { crawlable: false })

    expect(mockPatch).toHaveBeenCalledWith('/api/v1/hostnames/hostname-1', { crawlable: false })
    expect(result).toBeNull()
  })

  it('creates a hostname with the provided payload', async () => {
    const response = { id: 'hostname-1', result: null }
    mockPost.mockResolvedValueOnce(response)

    const result = await createHostname({ hostname: 'example.com', blocked: true })

    expect(mockPost).toHaveBeenCalledWith('/api/v1/hostnames', {
      hostname: 'example.com',
      blocked: true,
    })
    expect(result).toBe(response)
  })
})
