import { describe, expect, it, vi } from 'vitest'

const { mockGet, mockPost, mockPatch, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
  mockPost: vi.fn<VitestLooseMock>(),
  mockPatch: vi.fn<VitestLooseMock>(),
  mockDelete: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/lib/api/client/instance'),
  () =>
    ({
      clientApi: {
        get: mockGet,
        post: mockPost,
        patch: mockPatch,
        delete: mockDelete,
      },
    }) as unknown as typeof import('@/lib/api/client/instance'),
)

import {
  deleteTotpAuthenticator,
  getTotpAuthenticatorsClient,
  renameTotpAuthenticator,
  setupTotp,
  verifyTotpSetup,
} from '@/lib/api/client/auth-totp'

describe('TOTP authenticator client helpers', () => {
  it('setupTotp posts the setup request', async () => {
    mockPost.mockResolvedValue({ authenticator: { id: 'a-1' }, secret: 'ABC', uri: 'otpauth://x' })

    await setupTotp({ name: 'Work phone' })

    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/totp', { name: 'Work phone' })
  })

  it('verifyTotpSetup posts the verification code', async () => {
    mockPost.mockResolvedValue({ authenticator: { id: 'a-1' } })

    await verifyTotpSetup({ authenticator_id: 'a-1', code: '123456' })

    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/totp/setup/verification', {
      authenticator_id: 'a-1',
      code: '123456',
    })
  })

  it('getTotpAuthenticatorsClient fetches the first page without a cursor', async () => {
    mockGet.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    await getTotpAuthenticatorsClient()

    expect(mockGet).toHaveBeenCalledWith('/api/v1/auth/totp', { searchParams: undefined })
  })

  it('getTotpAuthenticatorsClient forwards the cursor and limit for continuation', async () => {
    mockGet.mockResolvedValue({
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    await getTotpAuthenticatorsClient({ after: 'cursor-1', limit: 20 })

    expect(mockGet).toHaveBeenCalledWith('/api/v1/auth/totp', {
      searchParams: { after: 'cursor-1', limit: 20 },
    })
  })

  it('renameTotpAuthenticator patches the authenticator name', async () => {
    mockPatch.mockResolvedValue(undefined)

    await renameTotpAuthenticator('a-1', 'New name')

    expect(mockPatch).toHaveBeenCalledWith('/api/v1/auth/totp/a-1', { name: 'New name' })
  })

  it('deleteTotpAuthenticator deletes without a re-auth token', async () => {
    mockDelete.mockResolvedValue(undefined)

    await deleteTotpAuthenticator('a-1')

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/auth/totp/a-1', { body: undefined })
  })

  it('deleteTotpAuthenticator forwards a re-auth token when provided', async () => {
    mockDelete.mockResolvedValue(undefined)

    await deleteTotpAuthenticator('a-1', 'reauth-token')

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/auth/totp/a-1', {
      body: { re_auth_token: 'reauth-token' },
    })
  })
})
