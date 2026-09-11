import { responseBody } from './static-response-bodies.mts'
import type { ApiFixtureAuthMode, ApiFixtureCase } from './types.mts'

const nativeConsumers = ['web', 'swift-core', 'swift-ui', 'dotnet-core'] as const

function fixtureCase(
  fixture: Omit<ApiFixtureCase, 'auth' | 'body' | 'consumers'> & {
    auth?: ApiFixtureAuthMode
  },
): ApiFixtureCase {
  return {
    ...fixture,
    auth: fixture.auth ?? 'fixture-developer',
    consumers: [...nativeConsumers],
    body: responseBody(fixture.id),
  }
}

export const dynamicConfigApiFixtureCases: ApiFixtureCase[] = [
  fixtureCase({
    id: 'native.feature-flags.default',
    method: 'GET',
    path: '/api/v1/feature-flags',
    route: { routeTemplate: '/api/v1/feature-flags' },
    auth: 'none',
    status: 200,
    migratedFrom: ['backend/api/v1/feature-flags/feature-flags.mts'],
  }),
  fixtureCase({
    id: 'native.captcha-config.default',
    method: 'GET',
    path: '/api/v1/captcha-config',
    route: { routeTemplate: '/api/v1/captcha-config' },
    auth: 'none',
    status: 200,
    migratedFrom: ['backend/api/v1/captcha-config/captcha-config.mts'],
  }),
  fixtureCase({
    id: 'native.dynamic-config.namespaces.developer',
    method: 'GET',
    path: '/api/v1/dynamic-config/namespaces',
    route: { routeTemplate: '/api/v1/dynamic-config/namespaces' },
    status: 200,
    migratedFrom: ['backend/api/v1/dynamic-config/dynamic-config.mts'],
  }),
  fixtureCase({
    id: 'native.dynamic-config.namespace.typed',
    method: 'GET',
    path: '/api/v1/dynamic-config/namespaces/recaptcha-config',
    route: {
      routeTemplate: '/api/v1/dynamic-config/namespaces/:namespace',
      pathParams: { namespace: 'recaptcha-config' },
    },
    status: 200,
    migratedFrom: ['backend/api/v1/dynamic-config/dynamic-config.mts'],
  }),
  fixtureCase({
    id: 'native.dynamic-config.namespace.string',
    method: 'GET',
    path: '/api/v1/dynamic-config/namespaces/app-attestation-config',
    route: {
      routeTemplate: '/api/v1/dynamic-config/namespaces/:namespace',
      pathParams: { namespace: 'app-attestation-config' },
    },
    status: 200,
    migratedFrom: ['backend/api/v1/dynamic-config/dynamic-config.mts'],
  }),
  fixtureCase({
    id: 'native.dynamic-config.namespace.integer',
    method: 'GET',
    path: '/api/v1/dynamic-config/namespaces/post-content-limits-config',
    route: {
      routeTemplate: '/api/v1/dynamic-config/namespaces/:namespace',
      pathParams: { namespace: 'post-content-limits-config' },
    },
    status: 200,
    migratedFrom: ['backend/api/v1/dynamic-config/dynamic-config.mts'],
  }),
  fixtureCase({
    id: 'native.dynamic-config.update.changed',
    method: 'PATCH',
    path: '/api/v1/dynamic-config/namespaces/feature-flags',
    route: {
      routeTemplate: '/api/v1/dynamic-config/namespaces/:namespace',
      pathParams: { namespace: 'feature-flags' },
    },
    requestBody: { config: { fediverse: true } },
    status: 200,
    migratedFrom: ['backend/api/v1/dynamic-config/dynamic-config.mts'],
  }),
  fixtureCase({
    id: 'native.dynamic-config.update.no-op',
    method: 'PATCH',
    path: '/api/v1/dynamic-config/namespaces/feature-flags',
    route: {
      routeTemplate: '/api/v1/dynamic-config/namespaces/:namespace',
      pathParams: { namespace: 'feature-flags' },
    },
    requestBody: { config: { fediverse: false } },
    status: 200,
    migratedFrom: ['backend/api/v1/dynamic-config/dynamic-config.mts'],
  }),
  fixtureCase({
    id: 'native.dynamic-config.history.default',
    method: 'GET',
    path: '/api/v1/dynamic-config/namespaces/feature-flags/history',
    route: {
      routeTemplate: '/api/v1/dynamic-config/namespaces/:namespace/history',
      pathParams: { namespace: 'feature-flags' },
    },
    status: 200,
    migratedFrom: ['backend/api/v1/dynamic-config/dynamic-config.mts'],
  }),
]
