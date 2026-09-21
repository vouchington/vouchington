import OpenAI from 'openai'
import { getLongRunningExternalFetch } from '@modules/utils'

let client: OpenAI | undefined

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim()
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set')
    client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: { 'X-OpenRouter-Metadata': 'enabled' },
      fetch: getLongRunningExternalFetch(),
    })
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
