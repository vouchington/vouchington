import OpenAI from 'openai'
import { getLongRunningExternalFetch } from '@modules/utils'

let client: OpenAI | undefined

function getClient(): OpenAI {
  if (!client) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim()
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set')
    }
    client = new OpenAI({ apiKey: OPENAI_API_KEY, fetch: getLongRunningExternalFetch() })
  }
  return client
}

// Proxy to lazily initialize the client only when actually used
export default new Proxy({} as OpenAI, {
  get(_, prop) {
    const target = getClient()
    const receiver = target as unknown as Record<PropertyKey, (...args: unknown[]) => unknown>
    const value = (target as unknown as Record<PropertyKey, unknown>)[prop]
    return typeof value === 'function' ? (...args: unknown[]) => receiver[prop](...args) : value
  },
})
