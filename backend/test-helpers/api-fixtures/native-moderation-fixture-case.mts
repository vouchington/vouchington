import { responseBody } from './static-response-bodies.mts'
import type { ApiFixtureCase } from './types.mts'

const nativeModerationConsumers = ['swift-core', 'swift-ui', 'dotnet-core'] as const

export function nativeModerationFixtureCase(
  fixture: Omit<ApiFixtureCase, 'auth' | 'body' | 'consumers' | 'status'> &
    Partial<Pick<ApiFixtureCase, 'auth' | 'body' | 'status'>>,
): ApiFixtureCase {
  return {
    ...fixture,
    auth: fixture.auth ?? 'fixture-admin',
    status: fixture.status ?? 200,
    consumers: [...nativeModerationConsumers],
    body: fixture.body === undefined ? responseBody(fixture.id) : fixture.body,
  }
}
