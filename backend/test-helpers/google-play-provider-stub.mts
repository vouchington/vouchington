import { AsyncLocalStorage } from 'node:async_hooks'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { onTestFinished, vi } from 'vitest'
import { GooglePlaySubscriptionLookupError } from '../services/memberships/google/configured-client.mts'
import { processGooglePlayMembershipVerification } from '../services/memberships/google/process-verification.mts'
import type { GooglePlaySubscriptionsV2Client } from '../services/memberships/google/types.mts'
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
  stubGooglePlayServiceAccount()
  return { agent, providerUrls }
}

let servicePrivateKey: string | undefined
function stubGooglePlayServiceAccount(): void {
  servicePrivateKey ??= generateKeyPairSync('rsa', {
    modulusLength: 2048,
  }).privateKey.export({ format: 'pem', type: 'pkcs8' })
  vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', `queue-test-${randomUUID()}@example.test`)
  vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY', servicePrivateKey)
}

const subscriptionAnswers = new AsyncLocalStorage<GooglePlaySubscriptionsV2Client>()
const SUBSCRIPTION_URL = /\/purchases\/subscriptionsv2\/tokens\/([^/?]+)$/
let answeringInstalled = false

/**
 * Serves the Google Play token and subscriptionsv2 endpoints at the external-fetch boundary, so the
 * production client signs, builds and parses every request. A GooglePlaySubscriptionLookupError
 * thrown by an answer is returned as that HTTP status and reason; any other error rejects the fetch.
 * Answers belong to the processWithGooglePlay call that runs them, so concurrent calls stay apart.
 */
function installGooglePlayAnswering(): void {
  if (answeringInstalled) return
  answeringInstalled = true
  const originalEmail = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL
  const originalKey = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY
  stubGooglePlayServiceAccount()
  const providerFetch: ReturnType<typeof httpDispatchers.getExternalFetch> = async input => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === 'https://oauth2.googleapis.com/token')
      return Response.json({ access_token: 'google-play-test-token', expires_in: 3600 })
    const answers = subscriptionAnswers.getStore()
    const purchaseToken = SUBSCRIPTION_URL.exec(url)?.[1]
    if (!answers || purchaseToken === undefined)
      throw new Error(`Unexpected Google Play provider URL ${url}`)
    try {
      return Response.json(
        await answers.getSubscription({
          packageName: decodeURIComponent(/\/applications\/([^/]+)\//.exec(url)?.[1] ?? ''),
          purchaseToken: decodeURIComponent(purchaseToken),
        }),
      )
    } catch (err) {
      if (!(err instanceof GooglePlaySubscriptionLookupError)) throw err
      return Response.json(
        err.reason === null ? {} : { error: { errors: [{ reason: err.reason }] } },
        { status: err.status },
      )
    }
  }
  const spy = vi.spyOn(httpDispatchers, 'getExternalFetch').mockReturnValue(providerFetch)
  onTestFinished(() => {
    answeringInstalled = false
    spy.mockRestore()
    restoreEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', originalEmail)
    restoreEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY', originalKey)
  })
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) vi.stubEnv(name, undefined)
  else vi.stubEnv(name, value)
}

/** Runs the production Google Play verification worker against a stubbed Google Play. */
export async function processWithGooglePlay(
  verificationId: string,
  answers: GooglePlaySubscriptionsV2Client,
): Promise<void> {
  installGooglePlayAnswering()
  await subscriptionAnswers.run(answers, () =>
    processGooglePlayMembershipVerification(verificationId),
  )
}

export function googlePlayTokenPath(applicationId: string, purchaseToken: string): string {
  return `/androidpublisher/v3/applications/${applicationId}/purchases/subscriptionsv2/tokens/${purchaseToken}`
}
