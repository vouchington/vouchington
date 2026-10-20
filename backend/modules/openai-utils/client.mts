import OpenAI from 'openai'
import { getLongRunningExternalFetch } from '@modules/utils'
import { getReceiverBoundProperty } from '@modules/utils/receiver-bound-property'
import { MissingModelClientCredentialError } from './missing-client-credential.mts'

let client: OpenAI | undefined
let clientKey: string | undefined

// Recheck the credential on every access so a cleared key cannot reuse a cached client.
function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new MissingModelClientCredentialError('OpenAI')
  if (!client || clientKey !== apiKey) {
    client = new OpenAI({ apiKey, fetch: getLongRunningExternalFetch() })
    clientKey = apiKey
  }
  return client
}

// Proxy to lazily initialize the client only when actually used
export default new Proxy({} as OpenAI, {
  get(_, prop) {
    return getReceiverBoundProperty(getClient(), prop)
  },
})
