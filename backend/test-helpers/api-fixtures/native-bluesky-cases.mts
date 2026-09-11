import type { ApiFixtureCase } from './types.mts'

const shared: Pick<ApiFixtureCase, 'auth' | 'consumers' | 'migratedFrom'> = {
  auth: 'fixture-user',
  consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
  migratedFrom: [],
}

export const nativeBlueskyApiFixtureCases: ApiFixtureCase[] = [
  {
    ...shared,
    id: 'native.auth.bluesky.link.default',
    method: 'POST',
    path: '/api/v1/auth/bluesky/link',
    route: { routeTemplate: '/api/v1/auth/bluesky/link' },
    status: 200,
    requestBody: { handle: 'alice.bsky.social' },
    body: { redirect_url: 'https://bsky.social/oauth/authorize' },
  },
  {
    ...shared,
    id: 'native.auth.bluesky.link.native',
    method: 'POST',
    path: '/api/v1/auth/bluesky/link',
    route: { routeTemplate: '/api/v1/auth/bluesky/link' },
    status: 200,
    requestBody: {
      handle: 'alice.bsky.social',
      callback_mode: 'native',
      completion_proof_challenge: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
    body: {
      redirect_url: 'https://bsky.social/oauth/authorize',
      flow_id: '00000000-0000-7000-8000-00000000b501',
    },
  },
  {
    ...shared,
    id: 'native.auth.bluesky.link-completion.default',
    method: 'POST',
    path: '/api/v1/auth/bluesky/link-completions',
    route: { routeTemplate: '/api/v1/auth/bluesky/link-completions' },
    status: 204,
    requestBody: {
      flow_id: '00000000-0000-7000-8000-00000000b501',
      completion_token: 'fixture-completion-token',
      completion_proof_verifier: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
    body: null,
  },
  {
    ...shared,
    id: 'native.auth.bluesky.unlink.default',
    method: 'DELETE',
    path: '/api/v1/auth/bluesky/link',
    route: { routeTemplate: '/api/v1/auth/bluesky/link' },
    status: 204,
    body: null,
  },
]
