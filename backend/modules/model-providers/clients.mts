import { toOpenRouterModel } from '@vouchington/ai/openai'
import { type CreateAnthropicMessage, ModelProviderError } from '@vouchington/ai/providers'
import { createOpenAIResponse } from '@modules/openai-utils/create-response'
import { MissingModelClientCredentialError } from '@modules/openai-utils/missing-client-credential'
import { createOpenRouterResponse } from '@modules/openrouter-utils'
import { getAnthropicClient } from './anthropic-client.mts'
import type { OpenAITransport } from './types.mts'

export type AnthropicDeps = { createMessage?: CreateAnthropicMessage }

export type OpenAIDeps = {
  createOpenAIResponse?: typeof createOpenAIResponse
  createOpenRouterResponse?: typeof createOpenRouterResponse
}

/* no-mistakes: integration=anthropic */
export const createAnthropicMessage: CreateAnthropicMessage = (params, options) =>
  getAnthropicClient().messages.create(params, options)

/**
 * The Responses call for the global transport setting the caller resolved: OpenRouter (model name
 * mapped) or OpenAI directly. A missing local credential is thrown before SDK dispatch, so it is a
 * permanent unbilled `client-unavailable`; every SDK/network failure is left untouched because its
 * billing outcome may be uncertain.
 */
export function openAIResponseCreator(transport: OpenAITransport, deps: OpenAIDeps = {}) {
  return async (
    params: Parameters<typeof createOpenAIResponse>[0] & { model: string },
    options?: Parameters<typeof createOpenAIResponse>[1],
  ) => {
    try {
      return transport === 'openrouter'
        ? await (deps.createOpenRouterResponse ?? createOpenRouterResponse)(
            { ...params, model: toOpenRouterModel(params.model) },
            options,
          )
        : await (deps.createOpenAIResponse ?? createOpenAIResponse)(params, options)
    } catch (err) {
      if (err instanceof MissingModelClientCredentialError) {
        throw new ModelProviderError('client-unavailable', err.message, {
          retryClass: 'permanent',
          cause: err,
        })
      }
      throw err
    }
  }
}
