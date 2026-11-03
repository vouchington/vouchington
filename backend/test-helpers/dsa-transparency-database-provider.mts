import { vi } from 'vitest'
import * as httpDispatchers from '../modules/utils/http.mts'
import { DSA_TEST_UUID } from './dsa-transparency-database-fixtures.mts'
import { createMockAgentFetchForTest, MockAgent } from './provider-http.mts'

export const DSA_TEST_PROVIDER_ORIGIN = 'https://synthetic.invalid.europa.eu'

type DsaProviderReply = { statusCode: number; body: unknown } | { error: Error }

export type DsaProviderRequest = {
  path: string
  method: string
  headers: Record<string, string>
  body: string
}

const acceptStatement = (): DsaProviderReply => ({ statusCode: 201, body: { uuid: DSA_TEST_UUID } })

/**
 * Routes the Transparency Database statement POST to a synthetic HTTP provider that counts and
 * records the requests that reach it. It accepts every statement unless `reply` answers otherwise.
 * Callers restore mocks after each test.
 */
export function stubDsaTransparencyDatabaseProvider(
  reply: (request: DsaProviderRequest) => DsaProviderReply = acceptStatement,
): { requests: number; received: DsaProviderRequest[] } {
  const agent = new MockAgent()
  agent.disableNetConnect()
  const provider = { requests: 0, received: [] as DsaProviderRequest[] }
  agent
    .get(DSA_TEST_PROVIDER_ORIGIN)
    .intercept({ path: '/api/v1/statement', method: 'POST' })
    .reply(options => {
      provider.requests++
      const request: DsaProviderRequest = {
        path: options.path,
        method: options.method,
        headers: Object.fromEntries(
          Object.entries(options.headers as Record<string, string>).map(([name, value]) => [
            name.toLowerCase(),
            value,
          ]),
        ),
        body: typeof options.body === 'string' ? options.body : '',
      }
      provider.received.push(request)
      const answer = reply(request)
      if ('error' in answer) throw answer.error
      return {
        statusCode: answer.statusCode,
        data: JSON.stringify(answer.body),
        responseOptions: { headers: { 'content-type': 'application/json' } },
      }
    })
    .persist()
  vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(createMockAgentFetchForTest(agent))
  return provider
}
