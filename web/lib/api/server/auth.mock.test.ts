import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getAuthMe,
  getPasskeys,
  getTotpAuthenticators,
  getMfaStatus,
  getAuthSessionsServer,
} from './auth'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('./instance'),
  () =>
    ({
      serverApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('./instance'),
)

describe('auth server api helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockGet.mockResolvedValue({})
  })

  it('getAuthMe calls the auth/me endpoint', async () => {
    await getAuthMe()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/auth/me', undefined)
  })

  it('getPasskeys calls the passkeys endpoint', async () => {
    await getPasskeys()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/auth/passkeys', undefined)
  })

  it('getTotpAuthenticators calls the totp endpoint', async () => {
    await getTotpAuthenticators()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/auth/totp', undefined)
  })

  it('getMfaStatus calls the mfa/status endpoint', async () => {
    await getMfaStatus()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/auth/mfa/status', undefined)
  })

  it('getAuthSessionsServer calls the auth/sessions endpoint', async () => {
    await getAuthSessionsServer()
    expect(mockGet).toHaveBeenCalledWith('/api/v1/auth/sessions', undefined)
  })
})
