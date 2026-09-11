import { describe, expect, it, vi } from 'vitest'

const { mockPost } = vi.hoisted(() => ({
  mockPost: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/lib/api/client/instance'),
  () =>
    ({
      clientApi: {
        post: mockPost,
      },
    }) as unknown as typeof import('@/lib/api/client/instance'),
)

import {
  verifyDiscoverablePasskey,
  verifyReAuthEmail,
  verifyReAuthTotp,
} from '@/lib/api/client/auth'

describe('re-auth client helpers', () => {
  it('verifyDiscoverablePasskey posts the response to the passkey verify endpoint', async () => {
    const response = { id: 'credential-id', type: 'public-key' }
    mockPost.mockResolvedValue({})

    await verifyDiscoverablePasskey(response)

    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/passkeys/authentication/verify', {
      response,
    })
  })

  it('verifyReAuthEmail posts the code to the email verification endpoint', async () => {
    mockPost.mockResolvedValue({})

    await verifyReAuthEmail('123456')

    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/mfa/re-auth/email/verification', {
      code: '123456',
    })
  })

  it('verifyReAuthTotp posts the code to the TOTP verification endpoint', async () => {
    mockPost.mockResolvedValue({})

    await verifyReAuthTotp('654321')

    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/mfa/re-auth/totp/verification', {
      code: '654321',
    })
  })
})
