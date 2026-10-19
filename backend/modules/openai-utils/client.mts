import OpenAI from 'openai'
import { getLongRunningExternalFetch } from '@modules/utils'
import { MissingModelClientCredentialError } from './missing-client-credential.mts'

let client: OpenAI | undefined
let clientKey: string | undefined

function getClient(): OpenAI {
  // Recheck the credential on every access. A client constructed while the key was set must not
  // survive a later clear: tests stub the key empty after another file in the same worker has
  // already constructed the singleton, and a real dispatch would ignore that missing credential.
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new MissingModelClientCredentialError('OpenAI')
  }
  if (!client || clientKey !== apiKey) {
    client = new OpenAI({ apiKey, fetch: getLongRunningExternalFetch() })
    clientKey = apiKey
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
