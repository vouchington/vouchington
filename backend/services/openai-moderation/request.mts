import type { OpenAI } from '@modules/openai-utils'
import { requestOpenAIModeration } from '@modules/openai-utils/moderate'
import { trackAIModerationCall } from '@services/analytics'
import { buildModerationInput } from '@vouchington/utils/ai-moderation'

interface CreateOpenAIModerationOptions {
  apiSafetyCheck?: true
  model?: 'omni-moderation-latest'
}

export const createOpenAIModeration = async (
  texts: string[],
  images_urls?: string[],
  options?: CreateOpenAIModerationOptions,
) => {
  const start = Date.now()
  const model = options?.model || 'omni-moderation-latest'
  try {
    const input: OpenAI.Moderations.ModerationMultiModalInput[] = buildModerationInput(
      texts,
      images_urls,
    )

    const requestOptions = {
      ...(options?.apiSafetyCheck ? { apiSafetyCheck: true } : {}),
    } satisfies Parameters<typeof requestOpenAIModeration>[2]
    const response =
      Object.keys(requestOptions).length > 0
        ? await requestOpenAIModeration(input, model, requestOptions)
        : await requestOpenAIModeration(input, model)
    trackAIModerationCall({
      service: 'openai',
      model,
      tokens: 0, // Moderation API does not return usage/tokens
      durationMs: Date.now() - start,
      success: true,
    })
    return response.results
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    trackAIModerationCall({
      service: 'openai',
      model,
      tokens: 0,
      durationMs: Date.now() - start,
      success: false,
      errorType: errorMessage,
    })
    throw err
  }
}
