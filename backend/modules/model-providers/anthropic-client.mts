import Anthropic from '@anthropic-ai/sdk'
import { getLongRunningExternalFetch } from '@modules/utils'
import { ModelProviderError } from './errors.mts'

type Credentials = { apiKey: string; authToken: null } | { apiKey: null; authToken: string }

/**
 * `ANTHROPIC_API_KEY` (ECS, local) wins; `ANTHROPIC_AUTH_TOKEN` (the CI federation token) is used
 * only when the key is unset. Neither set is a recorded failure, never a crash: boot does not
 * require the key, and a run that needs it ends through the caller's client-unavailable path.
 */
export function resolveAnthropicCredentials(
  env: Record<string, string | undefined> = process.env,
): Credentials {
  const apiKey = env.ANTHROPIC_API_KEY?.trim()
  if (apiKey) return { apiKey, authToken: null }
  const authToken = env.ANTHROPIC_AUTH_TOKEN?.trim()
  if (authToken) return { apiKey: null, authToken }
  throw new ModelProviderError(
    'client-unavailable',
    'Neither ANTHROPIC_API_KEY nor ANTHROPIC_AUTH_TOKEN is set.',
    { retryClass: 'permanent' },
  )
}

let cached: { credential: string; client: Anthropic } | undefined

/**
 * The shared client. The SDK's own retries are off: retrying is the caller's lifecycle decision,
 * since a retry after a billed turn is a double bill. It uses the same long-running fetch as the
 * OpenAI and OpenRouter clients; Node's default happy-eyeballs stays on because the API tasks reach
 * `api.anthropic.com` over IPv6 only.
 */
export function getAnthropicClient(): Anthropic {
  const credentials = resolveAnthropicCredentials()
  const credential = credentials.apiKey ?? credentials.authToken
  if (cached?.credential === credential) return cached.client
  const client = new Anthropic({
    ...credentials,
    maxRetries: 0,
    fetch: getLongRunningExternalFetch(),
  })
  cached = { credential, client }
  return client
}
