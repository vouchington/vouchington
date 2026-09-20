import { describe, it, vi } from 'vitest'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'
import type { OAuthAuthorizationDecisionResponse } from '@/types/oauth-authorization'

const mockPost = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: { post: mockPost },
    }) as unknown as typeof import('../instance'),
)

import { decideOAuthAuthorizationRequest } from '../oauth-authorization'

describe('OAuth authorization client', () => {
  it('submits a consent decision to the request resource', async () => {
    const response: OAuthAuthorizationDecisionResponse = {
      redirect_uri: 'https://client.example/callback?code=opaque',
    }
    await expectApiWrapperCall({
      mock: mockPost,
      response,
      call: () => decideOAuthAuthorizationRequest('request/id', 'approve'),
      expectedArgs: [
        '/api/v1/oauth/authorization-requests/request%2Fid/decisions',
        { decision: 'approve' },
      ],
    })
  })
})
