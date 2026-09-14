import { endpoint, type ManifestEndpoint } from './endpoint-registry'

export const authAndFediverseEndpointRegistry = {
  'native.oauth.providers.broker-capabilities': endpoint('/api/v1/auth/oauth/providers'),
  'native.oauth.authorization.begin': {
    method: 'POST',
    path: '/api/v1/auth/oauth/github/authorizations',
    requestBody: {
      purpose: 'authenticate',
      callback_mode: 'native',
      completion_proof_challenge: 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
    },
  },
  'native.oauth.authorization.complete.pending': {
    method: 'POST',
    path: '/api/v1/auth/oauth/authorizations/019fafb8-a44c-73e2-890a-497ff3dd27a6/complete',
    requestBody: {
      completion_token: 'native-completion-token',
      completion_proof_verifier: 'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV',
    },
  },
  'native.oauth.authorization.complete.authenticated': {
    method: 'POST',
    path: '/api/v1/auth/oauth/authorizations/019fafb8-a44c-73e2-890a-497ff3dd27a6/complete',
    requestBody: {
      completion_token: 'native-completion-token',
      completion_proof_verifier: 'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV',
    },
  },
  'native.oauth.authorization.complete.mfa': {
    method: 'POST',
    path: '/api/v1/auth/oauth/authorizations/019fafb8-a44c-73e2-890a-497ff3dd27a6/complete',
    requestBody: {
      completion_token: 'native-completion-token',
      completion_proof_verifier: 'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV',
    },
  },
  'native.oauth.authorization.complete.connected': {
    method: 'POST',
    path: '/api/v1/auth/oauth/authorizations/019fafb8-a44c-73e2-890a-497ff3dd27a6/complete',
    requestBody: {
      completion_token: 'native-completion-token',
      completion_proof_verifier: 'VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV',
    },
  },
  'native.auth.sessions.default': endpoint('/api/v1/auth/sessions', {
    after: 'fixture-owner-scoped-session-cursor',
    limit: '1',
  }),
  'native.auth.bluesky.link.default': {
    method: 'POST',
    path: '/api/v1/auth/bluesky/link',
    requestBody: { handle: 'alice.bsky.social' },
  },
  'native.auth.bluesky.link.native': {
    method: 'POST',
    path: '/api/v1/auth/bluesky/link',
    requestBody: {
      callback_mode: 'native',
      completion_proof_challenge: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      handle: 'alice.bsky.social',
    },
  },
  'native.auth.bluesky.link-completion.default': {
    method: 'POST',
    path: '/api/v1/auth/bluesky/link-completions',
    requestBody: {
      completion_proof_verifier: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      completion_token: 'fixture-completion-token',
      flow_id: '00000000-0000-7000-8000-00000000b501',
    },
  },
  'native.auth.bluesky.unlink.default': { method: 'DELETE', path: '/api/v1/auth/bluesky/link' },
  'native.fediverse.instances.default': endpoint('/api/v1/fediverse/instances', {
    limit: '25',
    sort: 'best',
  }),
  'native.fediverse.instances.page-2': endpoint('/api/v1/fediverse/instances', {
    after: 'next',
    limit: '25',
  }),
  'native.fediverse.instances.empty': endpoint('/api/v1/fediverse/instances', {
    q: 'no-match-fixture-query',
  }),
  'native.fediverse.instance.slug': endpoint('/api/v1/fediverse/instances/social-example'),
  'native.fediverse.instance.uuid': endpoint(
    '/api/v1/fediverse/instances/00000000-0000-7000-8000-00000000f003',
  ),
} satisfies Record<string, ManifestEndpoint>
