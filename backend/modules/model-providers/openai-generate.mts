import {
  createOpenAIResponse,
  type OpenAIResponse,
  type OpenAIUsage,
} from '@modules/openai-utils/create-response'
import { createOpenRouterResponse, toOpenRouterModel } from '@modules/openrouter-utils'
import { ModelProviderError } from './errors.mts'
import { MissingModelClientCredentialError } from '@modules/openai-utils/missing-client-credential'
import type {
  BilledModelResponse,
  GenerateJsonRequest,
  ModelCallResult,
  OpenAITransport,
} from './types.mts'
import { openAIUsageToModelUsage } from './usage.mts'
import { parseSchemaValidJson } from './validate-output.mts'

type CreateOpenAIResponse = typeof createOpenAIResponse
type CreateOpenRouterResponse = typeof createOpenRouterResponse

export type OpenAIDeps = {
  createOpenAIResponse?: CreateOpenAIResponse
  createOpenRouterResponse?: CreateOpenRouterResponse
}

const NO_USAGE: OpenAIUsage = { input_tokens: 0, output_tokens: 0 }

/**
 * One OpenAI Responses call whose answer is JSON in the Responses `json_schema` format. Which
 * endpoint serves it (OpenRouter or OpenAI directly) is the global transport setting the caller
 * resolved; it is never a per-agent option. Failures that still billed (a non-completed response)
 * keep the SDK error, which carries the usage; a completed but schema-invalid answer is wrapped
 * with its billed response so the ledger still records it.
 */
export async function callOpenAIJson<T>(
  model: string,
  transport: OpenAITransport,
  request: GenerateJsonRequest<T>,
  deps: OpenAIDeps = {},
): Promise<ModelCallResult<T>> {
  const params = {
    instructions: request.instructions,
    input: request.input,
    max_output_tokens: request.maxOutputTokens,
    ...(request.safetyIdentifier ? { safety_identifier: request.safetyIdentifier } : {}),
    ...(request.promptCacheKey ? { prompt_cache_key: request.promptCacheKey } : {}),
    ...(request.flex ? { service_tier: 'flex' as const } : {}),
    text: {
      format: {
        type: 'json_schema' as const,
        name: request.schemaName,
        schema: request.schema,
        strict: true,
      },
    },
  }
  const options = request.maxRetries === undefined ? undefined : { maxRetries: request.maxRetries }
  let response: OpenAIResponse
  try {
    response =
      transport === 'openrouter'
        ? await (deps.createOpenRouterResponse ?? createOpenRouterResponse)(
            { ...params, model: toOpenRouterModel(model) },
            options,
          )
        : await (deps.createOpenAIResponse ?? createOpenAIResponse)({ ...params, model }, options)
  } catch (err) {
    // The lazy client throws this only while resolving local credentials, before SDK dispatch.
    // Leave every SDK/network failure untouched because its billing outcome may be uncertain.
    if (err instanceof MissingModelClientCredentialError) {
      throw new ModelProviderError('client-unavailable', err.message, {
        retryClass: 'permanent',
        cause: err,
      })
    }
    throw err
  }
  const billed: BilledModelResponse = {
    provider: 'openai',
    transport,
    model: response.model ?? model,
    responseId: response.id,
    serviceTier: response.service_tier ?? 'unknown-tier',
    usage: openAIUsageToModelUsage(response.usage ?? NO_USAGE),
  }
  try {
    return { ...billed, output: parseSchemaValidJson(response.output_text, request) }
  } catch (err) {
    throw new ModelProviderError('invalid-response', 'OpenAI output failed validation.', {
      retryClass: 'permanent',
      billedResponse: billed,
      cause: err,
    })
  }
}
