import OpenAI from 'openai'
import { getLongRunningExternalFetch } from '@modules/utils'
import { getReceiverBoundProperty } from '@modules/utils/receiver-bound-property'
import { MissingModelClientCredentialError } from '@modules/openai-utils/missing-client-credential'

let client: OpenAI | undefined
let clientKey: string | undefined

// Recheck the credential on every access so a cleared key cannot reuse a cached client.
function getClient(): OpenAI {
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
    return getReceiverBoundProperty(getClient(), prop)
  },
})
