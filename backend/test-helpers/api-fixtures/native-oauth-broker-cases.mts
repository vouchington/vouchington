import { user } from './data.mts'
import type { ApiFixtureCase } from './types.mts'
import { nativeFriendRecommendationApiFixtureCases } from './native-friend-recommendation-cases.mts'

const brokerCapabilities = {
  facebook: {
    version: 1,
    modes: { web: true, native: true },
    purposes: ['authenticate', 'connect'],
  },
  x: {
    version: 1,
    modes: { web: true, native: true },
    purposes: ['authenticate', 'connect'],
  },
  github: {
    version: 1,
    modes: { web: true, native: true },
    purposes: ['authenticate', 'connect'],
  },
}

const nativeConsumers = ['swift-core', 'swift-ui', 'dotnet-core'] as const

export const nativeOAuthBrokerApiFixtureCases: ApiFixtureCase[] = [
  {
    id: 'native.oauth.providers.broker-capabilities',
    method: 'GET',
    path: '/api/v1/auth/oauth/providers',
    route: { routeTemplate: '/api/v1/auth/oauth/providers' },
    auth: 'none',
    status: 200,
    body: {
      providers: ['facebook', 'x', 'github'],
      broker_capabilities: brokerCapabilities,
    },
    consumers: [...nativeConsumers],
    migratedFrom: [],
  },
  {
    id: 'native.oauth.authorization.begin',
    method: 'POST',
    path: '/api/v1/auth/oauth/github/authorizations',
    route: {
      routeTemplate: '/api/v1/auth/oauth/:provider/authorizations',
      pathParams: { provider: 'github' },
    },
    auth: 'none',
    status: 200,
    requestBody: {
      purpose: 'authenticate',
      callback_mode: 'native',
      completion_proof_challenge: 'Z'.repeat(43),
    },
    body: {
      flow_id: '019fafb8-a44c-73e2-890a-497ff3dd27a6',
      redirect_url: 'https://github.com/login/oauth/authorize?client_id=fixture',
      expires_at: '2026-07-29T22:00:00.000Z',
    },
    consumers: [...nativeConsumers],
    migratedFrom: [],
  },
  {
    id: 'native.oauth.authorization.complete.pending',
    method: 'POST',
    path: '/api/v1/auth/oauth/authorizations/019fafb8-a44c-73e2-890a-497ff3dd27a6/complete',
    route: {
      routeTemplate: '/api/v1/auth/oauth/authorizations/:flowId/complete',
      pathParams: { flowId: '019fafb8-a44c-73e2-890a-497ff3dd27a6' },
    },
    backendResponseContractKey: 'POST:/api/v1/auth/oauth/authorizations/:flowId/complete#pending',
    auth: 'none',
    status: 202,
    requestBody: {
      completion_token: 'native-completion-token',
      completion_proof_verifier: 'V'.repeat(43),
    },
    body: { status: 'pending' },
    consumers: [...nativeConsumers],
    migratedFrom: [],
  },
  {
    id: 'native.oauth.authorization.complete.authenticated',
    method: 'POST',
    path: '/api/v1/auth/oauth/authorizations/019fafb8-a44c-73e2-890a-497ff3dd27a6/complete',
    route: {
      routeTemplate: '/api/v1/auth/oauth/authorizations/:flowId/complete',
      pathParams: { flowId: '019fafb8-a44c-73e2-890a-497ff3dd27a6' },
    },
    backendResponseContractKey:
      'POST:/api/v1/auth/oauth/authorizations/:flowId/complete#authenticated',
    auth: 'none',
    status: 200,
    requestBody: {
      completion_token: 'native-completion-token',
      completion_proof_verifier: 'V'.repeat(43),
    },
    body: {
      user: {
        id: user.id,
        username: user.username,
        email_address: 'tests+oauth-broker@voucha.ai',
        roles: ['user'],
        profile_image_id: user.profile_image_id,
      },
    },
    consumers: [...nativeConsumers],
    migratedFrom: [],
  },
  {
    id: 'native.oauth.authorization.complete.mfa',
    method: 'POST',
    path: '/api/v1/auth/oauth/authorizations/019fafb8-a44c-73e2-890a-497ff3dd27a6/complete',
    route: {
      routeTemplate: '/api/v1/auth/oauth/authorizations/:flowId/complete',
      pathParams: { flowId: '019fafb8-a44c-73e2-890a-497ff3dd27a6' },
    },
    backendResponseContractKey: 'POST:/api/v1/auth/oauth/authorizations/:flowId/complete#mfa',
    auth: 'none',
    status: 200,
    requestBody: {
      completion_token: 'native-completion-token',
      completion_proof_verifier: 'V'.repeat(43),
    },
    body: {
      mfa_required: true,
      login_attempt_id: '019fafba-d1a5-7ec2-a8d7-f3895d7a465a',
    },
    consumers: [...nativeConsumers],
    migratedFrom: [],
  },
  {
    id: 'native.oauth.authorization.complete.connected',
    method: 'POST',
    path: '/api/v1/auth/oauth/authorizations/019fafb8-a44c-73e2-890a-497ff3dd27a6/complete',
    route: {
      routeTemplate: '/api/v1/auth/oauth/authorizations/:flowId/complete',
      pathParams: { flowId: '019fafb8-a44c-73e2-890a-497ff3dd27a6' },
    },
    backendResponseContractKey: 'POST:/api/v1/auth/oauth/authorizations/:flowId/complete#connected',
    auth: 'fixture-user',
    status: 200,
    requestBody: {
      completion_token: 'native-completion-token',
      completion_proof_verifier: 'V'.repeat(43),
    },
    body: {
      oauth_account: {
        id: 'github-fixture-user',
        name: 'Fixture GitHub User',
        email_address: 'tests+github@voucha.ai',
      },
    },
    consumers: [...nativeConsumers],
    migratedFrom: [],
  },
  ...nativeFriendRecommendationApiFixtureCases,
]
