import { buildModerationInput } from '@vouchington/utils/ai-moderation'
import { requestOpenAIModeration } from '@modules/openai-utils/moderate'
import { trackAIModerationCall } from '@services/analytics'

interface CreateOpenAIModerationOptions {
  apiSafetyCheck?: true
  model?: 'omni-moderation-latest'
  dependencies?: Partial<CreateOpenAIModerationDependencies>
}

type CreateOpenAIModerationDependencies = {
  requestOpenAIModeration: typeof requestOpenAIModeration
}

const defaultDependencies: CreateOpenAIModerationDependencies = { requestOpenAIModeration }

export const createOpenAIModeration = async (
  texts: string[],
  images_urls?: string[],
  options?: CreateOpenAIModerationOptions,
) => {
  const dependencies = { ...defaultDependencies, ...options?.dependencies }
  const start = Date.now()
  const model = options?.model || 'omni-moderation-latest'
  try {
    const input = buildModerationInput(texts, images_urls)

    const requestOptions = {
      ...(options?.apiSafetyCheck ? { apiSafetyCheck: true } : {}),
    } satisfies Parameters<CreateOpenAIModerationDependencies['requestOpenAIModeration']>[2]
    const response =
      Object.keys(requestOptions).length > 0
        ? await dependencies.requestOpenAIModeration(input, model, requestOptions)
        : await dependencies.requestOpenAIModeration(input, model)
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
