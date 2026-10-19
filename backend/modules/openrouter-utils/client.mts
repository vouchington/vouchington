import OpenAI from 'openai'
import { getLongRunningExternalFetch } from '@modules/utils'
import { MissingModelClientCredentialError } from '@modules/openai-utils/missing-client-credential'

let client: OpenAI | undefined
let clientKey: string | undefined

function getClient(): OpenAI {
  // Same credential recheck as the direct OpenAI client: a cached client must not outlive a
  // cleared key, or a later missing-credential test dispatches on the first worker's client.
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) throw new MissingModelClientCredentialError('OpenRouter')
  if (!client || clientKey !== apiKey) {
    client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: { 'X-OpenRouter-Metadata': 'enabled' },
      fetch: getLongRunningExternalFetch(),
    })
    clientKey = apiKey
  }
  return client
}

export default new Proxy({} as OpenAI, {
  get(_, prop) {
    const target = getClient()
    const receiver = target as unknown as Record<PropertyKey, (...args: unknown[]) => unknown>
    const value = (target as unknown as Record<PropertyKey, unknown>)[prop]

    return typeof value === 'function' ? (...args: unknown[]) => receiver[prop](...args) : value
  },
})
