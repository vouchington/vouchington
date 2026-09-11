import OpenAI from 'openai'
import { getProviderFetch } from '@modules/api-egress-proxy'

let moderationClient: OpenAI | undefined
const MODERATION_ATTEMPT_TIMEOUT_MS = 5_000
const MODERATION_OVERALL_TIMEOUT_MS = 10_000
const MODERATION_MAX_RETRIES = 1

export type OpenAIModerationRequestOptions = Pick<OpenAI.RequestOptions, 'idempotencyKey'> & {
  apiSafetyCheck?: true
}

function getModerationClient(): OpenAI {
  if (!moderationClient) {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
    moderationClient = new OpenAI({
      apiKey,
      fetch: getProviderFetch('openai_moderation_enabled', 'long-running'),
    })
  }
  return moderationClient
}

/* no-mistakes: integration=openai */
export async function requestOpenAIModeration(
  input: OpenAI.Moderations.ModerationMultiModalInput[],
  model: 'omni-moderation-latest',
  options?: OpenAIModerationRequestOptions,
) {
  const openai = getModerationClient()
  const { apiSafetyCheck, ...requestOptions } = options ?? {}
  return await openai.moderations.create(
    { input, model },
    apiSafetyCheck
      ? {
          ...requestOptions,
          maxRetries: MODERATION_MAX_RETRIES,
          timeout: MODERATION_ATTEMPT_TIMEOUT_MS,
          signal: AbortSignal.timeout(MODERATION_OVERALL_TIMEOUT_MS),
        }
      : requestOptions,
  )
}
