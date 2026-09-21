import { describe, expect, it, vi } from 'vitest'
import type { OAuthAuthorizationRequestResponse } from '@/types/oauth-authorization'

const mockGet = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('./instance'),
  () =>
    ({
      serverApi: { get: mockGet },
    }) as unknown as typeof import('./instance'),
)

import { getOAuthAuthorizationRequest } from './oauth-authorization'

describe('OAuth authorization server helper', () => {
  it('loads the current user-owned consent request', async () => {
    const response: OAuthAuthorizationRequestResponse = {
      authorization_request: {
        id: 'request-1',
        client_name: 'Example app',
        resource: 'https://voucha.ai/api/v1/mcp',
        scopes: ['mcp.user:read'],
        expires_at: '2026-09-20T12:00:00.000Z',
      },
    }
    mockGet.mockResolvedValueOnce(response)

    await expect(getOAuthAuthorizationRequest('request/id')).resolves.toBe(response)
    expect(mockGet).toHaveBeenCalledWith('/api/v1/oauth/authorization-requests/request%2Fid')
  })
})
