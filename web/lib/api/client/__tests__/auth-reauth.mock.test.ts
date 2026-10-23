import { beforeEach, describe, it, vi } from 'vitest'
import { expectApiWrapperCall } from '@/test-helpers/api-wrapper'

const mocks = vi.hoisted(() => ({ get: vi.fn<VitestLooseMock>(), post: vi.fn<VitestLooseMock>() }))
vi.mock(
  import('@/lib/api/client/instance'),
  () =>
    ({
      clientApi: { get: mocks.get, post: mocks.post },
    }) as unknown as typeof import('@/lib/api/client/instance'),
)

import {
  beginBrokerProviderReAuth,
  beginSdkProviderReAuth,
  getPasskeyReAuthOptions,
  getReAuthMethods,
  retrieveBrokerProviderReAuthProof,
  verifyPasskeyReAuth,
  verifySdkProviderReAuth,
  type ReAuthMethods,
  type ReAuthProof,
} from '../auth-reauth'

const passkeyId = '01931e00-0000-7000-8000-000000000123'
const flowId = '01931e00-0000-7000-8000-000000000456'
const proof: ReAuthProof = { re_auth_token: 'server-scoped-proof' }

describe('fresh authentication client contract', () => {
  beforeEach(() => vi.clearAllMocks())

  it('discovers usable methods for the authenticated account', async () => {
    const response: ReAuthMethods = {
      has_email: false,
      has_totp: false,
      has_passkey: true,
      providers: ['google'],
    }
    await expectApiWrapperCall({
      mock: mocks.get,
      response,
      call: getReAuthMethods,
      expectedArgs: ['/api/v1/auth/re-auth/methods'],
    })
  })

  it('binds passkey options to the selected named credential', async () => {
    const response: Awaited<ReturnType<typeof getPasskeyReAuthOptions>> = {
      flow_id: flowId,
      options: { challenge: 'server-challenge' },
    }
    await expectApiWrapperCall({
      mock: mocks.post,
      response,
      call: () => getPasskeyReAuthOptions(passkeyId),
      expectedArgs: ['/api/v1/auth/re-auth/passkeys/options', { passkey_id: passkeyId }],
    })
  })

  it('carries the selected passkey, original flow and actual assertion together', async () => {
    const assertion = { id: 'credential-id', response: { signature: 'signed-assertion' } }
    await expectApiWrapperCall({
      mock: mocks.post,
      response: proof,
      call: () => verifyPasskeyReAuth(passkeyId, flowId, assertion),
      expectedArgs: [
        '/api/v1/auth/re-auth/passkeys/verification',
        { passkey_id: passkeyId, flow_id: flowId, response: assertion },
      ],
    })
  })

  it.each(['apple', 'google'] as const)('requests a fresh server nonce for %s', async provider => {
    const response = { flow_id: flowId, nonce: 'server-nonce', expires_at: '2026-10-23T12:05:00Z' }
    await expectApiWrapperCall({
      mock: mocks.post,
      response,
      call: () => beginSdkProviderReAuth(provider),
      expectedArgs: [`/api/v1/auth/re-auth/providers/${provider}/challenges`],
    })
  })

  it.each(['apple', 'google'] as const)(
    'sends the signed %s credential with its nonce flow',
    async provider => {
      await expectApiWrapperCall({
        mock: mocks.post,
        response: proof,
        call: () => verifySdkProviderReAuth(provider, flowId, 'signed-provider-credential'),
        expectedArgs: [
          `/api/v1/auth/re-auth/providers/${provider}/verification`,
          { flow_id: flowId, credential: 'signed-provider-credential' },
        ],
      })
    },
  )

  it('begins a separate provider proof roundtrip', async () => {
    const response = {
      flow_id: flowId,
      redirect_url: 'https://github.com/login/oauth/authorize',
      expires_at: '2026-10-23T12:05:00Z',
    }
    await expectApiWrapperCall({
      mock: mocks.post,
      response,
      call: () => beginBrokerProviderReAuth('github'),
      expectedArgs: [
        '/api/v1/auth/re-auth/providers/github/authorizations',
        { callback_mode: 'web' },
      ],
    })
  })

  it('retrieves proof through the separately authenticated completion call', async () => {
    await expectApiWrapperCall({
      mock: mocks.post,
      response: proof,
      call: () => retrieveBrokerProviderReAuthProof('github', flowId),
      expectedArgs: ['/api/v1/auth/re-auth/providers/github/proofs', { flow_id: flowId }],
    })
  })
})
