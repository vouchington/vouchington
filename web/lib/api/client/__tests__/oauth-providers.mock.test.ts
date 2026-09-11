import { describe, expect, it, vi } from 'vitest'

const mockGet = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        get: mockGet,
      },
    }) as unknown as typeof import('../instance'),
)

import { getConfiguredOAuthProviders } from '../oauth-providers'

describe('oauth providers client', () => {
  it('loads configured OAuth providers', async () => {
    const response = {
      providers: ['github'],
      broker_capabilities: {
        github: {
          version: 1,
          modes: { web: true, native: false },
          purposes: ['authenticate', 'connect'],
        },
      },
    }
    mockGet.mockResolvedValue(response)

    await expect(getConfiguredOAuthProviders()).resolves.toEqual(response)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/auth/oauth/providers')
  })
})
