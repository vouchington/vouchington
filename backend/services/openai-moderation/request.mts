import type { OpenAI } from '@modules/openai-utils'
import { requestOpenAIModeration } from '@modules/openai-utils/moderate'
import { trackAIModerationCall } from '@services/analytics'

interface CreateOpenAIModerationOptions {
  apiSafetyCheck?: true
  idempotencyKey?: string
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
    const input: OpenAI.Moderations.ModerationMultiModalInput[] = [
      ...texts.map(text => ({ type: 'text' as const, text })),
      ...(images_urls ?? []).map(url => ({
        type: 'image_url' as const,
        image_url: { url },
      })),
    ]

    const requestOptions = {
      ...(options?.apiSafetyCheck ? { apiSafetyCheck: true } : {}),
      ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
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
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    trackAIModerationCall({
      service: 'openai',
      model,
      tokens: 0,
      durationMs: Date.now() - start,
      success: false,
      errorType: errorMessage,
    })
    throw error
  }
}
