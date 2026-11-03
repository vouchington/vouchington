import { vi } from 'vitest'
import * as httpDispatchers from '../modules/utils/http.mts'
import { DSA_TEST_UUID } from './dsa-transparency-database-fixtures.mts'
import { createMockAgentFetchForTest, MockAgent } from './provider-http.mts'

export const DSA_TEST_PROVIDER_ORIGIN = 'https://synthetic.invalid.europa.eu'

/**
 * Routes the Transparency Database statement POST to a synthetic HTTP provider that accepts every
 * statement and counts the requests that reach it. Callers restore mocks after each test.
 */
export function stubDsaTransparencyDatabaseProvider(): { requests: number } {
  const agent = new MockAgent()
  agent.disableNetConnect()
  const provider = { requests: 0 }
  agent
    .get(DSA_TEST_PROVIDER_ORIGIN)
    .intercept({ path: '/api/v1/statement', method: 'POST' })
    .reply(() => {
      provider.requests++
      return {
        statusCode: 201,
        data: JSON.stringify({ uuid: DSA_TEST_UUID }),
        responseOptions: { headers: { 'content-type': 'application/json' } },
      }
    })
    .persist()
  vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(createMockAgentFetchForTest(agent))
  return provider
}
