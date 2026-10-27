import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import * as httpDispatchers from '../modules/utils/http.mts'
import { createMockAgentFetchForTest, MockAgent } from './provider-http.mts'

/** Routes Google Play calls to a MockAgent; callers restore mocks and env after each test. */
export function stubGooglePlayProvider(onRequest?: (url: string) => Promise<void> | void): {
  agent: MockAgent
  providerUrls: string[]
} {
  const agent = new MockAgent()
  agent.disableNetConnect()
  const providerUrls: string[] = []
  const agentFetch = createMockAgentFetchForTest(agent)
  const providerFetch: ReturnType<typeof httpDispatchers.getExternalFetch> = async (
    input,
    init,
  ) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    providerUrls.push(url)
    await onRequest?.(url)
    return agentFetch(input, init)
  }
  vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(providerFetch)
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', `queue-test-${randomUUID()}@example.test`)
  vi.stubEnv(
    'GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY',
    privateKey.export({ format: 'pem', type: 'pkcs8' }),
  )
  return { agent, providerUrls }
}

export function googlePlayTokenPath(applicationId: string, purchaseToken: string): string {
  return `/androidpublisher/v3/applications/${applicationId}/purchases/subscriptionsv2/tokens/${purchaseToken}`
}
