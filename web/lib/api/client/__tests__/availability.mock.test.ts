import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockClientApiGet } = vi.hoisted(() => ({
  mockClientApiGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/lib/api/client/instance'),
  () =>
    ({
      clientApi: {
        get: mockClientApiGet,
      },
    }) as unknown as typeof import('@/lib/api/client/instance'),
)

import { checkAvailability } from '@/lib/api/client/availability'

describe('checkAvailability', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls the correct endpoint with kind and value search params', async () => {
    mockClientApiGet.mockResolvedValue({ available: true, conflict: null })

    await checkAvailability('topic-slug', 'my-slug')

    expect(mockClientApiGet).toHaveBeenCalledOnce()
    expect(mockClientApiGet).toHaveBeenCalledWith('/api/v1/availability', {
      searchParams: { kind: 'topic-slug', value: 'my-slug' },
      signal: undefined,
    })
  })

  it('passes the AbortSignal through', async () => {
    mockClientApiGet.mockResolvedValue({ available: false, conflict: null })
    const controller = new AbortController()

    await checkAvailability('username', 'bob', controller.signal)

    expect(mockClientApiGet).toHaveBeenCalledWith('/api/v1/availability', {
      searchParams: { kind: 'username', value: 'bob' },
      signal: controller.signal,
    })
  })

  it('returns the availability result from the API', async () => {
    const conflict = {
      kind: 'topic' as const,
      id: 'abc',
      slug: 'dev-tools',
      name: 'Dev Tools',
      topic_type: 'topic',
    }
    mockClientApiGet.mockResolvedValue({ available: false, conflict })

    const result = await checkAvailability('topic-slug', 'dev-tools')

    expect(result.available).toBe(false)
    expect(result.conflict).toEqual(conflict)
  })
})
