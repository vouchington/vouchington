import {
  callOpenAIJson as generate,
  ModelProviderError,
  type GenerateJsonRequest,
} from '@vouchington/ai/providers'
import { toOpenRouterModel } from '@vouchington/ai/openai'
import { createOpenAIResponse } from '@modules/openai-utils/create-response'
import { createOpenRouterResponse } from '@modules/openrouter-utils'
import { MissingModelClientCredentialError } from '@modules/openai-utils/missing-client-credential'
import type { ModelCallResult, OpenAITransport } from './types.mts'
export type OpenAIDeps = {
  createOpenAIResponse?: typeof createOpenAIResponse
  createOpenRouterResponse?: typeof createOpenRouterResponse
}

export async function callOpenAIJson<T>(
  model: string,
  transport: OpenAITransport,
  request: GenerateJsonRequest<T>,
  deps: OpenAIDeps = {},
): Promise<ModelCallResult<T>> {
  const result = await generate(
    async (params, options) => {
      try {
        return transport === 'openrouter'
          ? await (deps.createOpenRouterResponse ?? createOpenRouterResponse)(
              { ...params, model: toOpenRouterModel(params.model) },
              options,
            )
          : await (deps.createOpenAIResponse ?? createOpenAIResponse)(params, options)
      } catch (err) {
        if (err instanceof MissingModelClientCredentialError)
          throw new ModelProviderError('client-unavailable', err.message, {
            retryClass: 'permanent',
            cause: err,
          })
        throw err
      }
    },
    model,
    transport,
    request,
  )
  return { ...result, provider: 'openai', transport }
}
