import { describe, expect, it, vi } from 'vitest'

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
  mockPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/lib/api/client/instance'),
  () =>
    ({
      clientApi: {
        get: mockGet,
        post: mockPost,
      },
    }) as unknown as typeof import('@/lib/api/client/instance'),
)

import {
  getDiscoverablePasskeyOptions,
  getPasskeysClient,
  verifyDiscoverablePasskey,
} from '@/lib/api/client/auth'

describe('discoverable passkey client helpers', () => {
  it('getDiscoverablePasskeyOptions posts to the options endpoint', async () => {
    mockPost.mockResolvedValue({ options: {} })
    await getDiscoverablePasskeyOptions()
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/passkeys/authentication/options', {})
  })

  it('verifyDiscoverablePasskey posts the response to the verify endpoint', async () => {
    const fakeResponse = { id: 'cred', rawId: 'cred', type: 'public-key' }
    mockPost.mockResolvedValue({ user: { id: 'u1' } })
    await verifyDiscoverablePasskey(fakeResponse)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/passkeys/authentication/verify', {
      response: fakeResponse,
    })
  })
})

describe('passkey list client helper', () => {
  it('getPasskeysClient fetches the first page without a cursor', async () => {
    mockGet.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    await getPasskeysClient()

    expect(mockGet).toHaveBeenCalledWith('/api/v1/auth/passkeys', { searchParams: undefined })
  })

  it('getPasskeysClient forwards the cursor and limit for continuation', async () => {
    mockGet.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    await getPasskeysClient({ after: 'cursor-1', limit: 20 })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/auth/passkeys', {
      searchParams: { after: 'cursor-1', limit: 20 },
    })
  })
})
