import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { clientApi } from '../instance'
import { fetchAdditionalHostnames } from '../topic-additional-hostnames'

const mockGet = vi.mocked(clientApi.get)

describe('topic-additional-hostnames client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('fetches additional hostnames without pagination options', async () => {
    const response = {
      results: [
        {
          hostname_id: 'hostname-1',
          hostname: 'example.com',
          topic_id: 'topic-1',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    }
    mockGet.mockResolvedValueOnce(response)

    const result = await fetchAdditionalHostnames('topic-1')

    expect(mockGet).toHaveBeenCalledWith('/api/v1/topics/topic-1/additional-hostnames', {
      searchParams: { after: undefined, limit: undefined },
    })
    expect(result).toBe(response)
  })

  it('fetches additional hostnames with cursor pagination options', async () => {
    const response = {
      results: [
        {
          hostname_id: 'hostname-2',
          hostname: 'second.example.com',
          topic_id: 'topic-1',
          created_at: '2026-01-02T00:00:00Z',
        },
      ],
      page_info: { has_next_page: true, end_cursor: 'cursor-2', start_cursor: 'cursor-2' },
    }
    mockGet.mockResolvedValueOnce(response)

    const result = await fetchAdditionalHostnames('topic-1', { after: 'cursor-1', limit: 10 })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/topics/topic-1/additional-hostnames', {
      searchParams: { after: 'cursor-1', limit: 10 },
    })
    expect(result).toBe(response)
  })
})
