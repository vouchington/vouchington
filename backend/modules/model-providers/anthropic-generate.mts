import type Anthropic from '@anthropic-ai/sdk'
import { getAnthropicClient } from './anthropic-client.mts'
import { classifyAnthropicError, ModelProviderError } from './errors.mts'
import type { BilledModelResponse, GenerateJsonRequest, ModelCallResult } from './types.mts'
import { anthropicUsageToModelUsage } from './usage.mts'
import { parseSchemaValidJson } from './validate-output.mts'

type CreateMessage = (
  params: Anthropic.MessageCreateParamsNonStreaming,
  options?: { signal?: AbortSignal },
) => PromiseLike<Anthropic.Message>

export type AnthropicDeps = { createMessage?: CreateMessage }

/* v8 ignore start -- thin Anthropic integration wrapper; exercised by credentialed *.anthropic.test.mts */
/* no-mistakes: integration=anthropic */
function createWithClient(
  params: Anthropic.MessageCreateParamsNonStreaming,
  options?: { signal?: AbortSignal },
): PromiseLike<Anthropic.Message> {
  return getAnthropicClient().messages.create(params, options)
}
/* v8 ignore stop */

function unusable(
  code: 'refusal' | 'output-truncated' | 'invalid-response',
  message: string,
  billedResponse: BilledModelResponse,
  cause?: unknown,
): ModelProviderError {
  return new ModelProviderError(code, message, { retryClass: 'permanent', billedResponse, cause })
}

/**
 * One synchronous Messages call whose answer is JSON constrained by `output_config.format` and
 * validated again against the same schema. Haiku 5.5 rejects non-default sampling parameters, so
 * none is ever sent. A 2xx answer that is a refusal, truncated or schema-invalid still billed, so
 * the thrown error carries the billed response for the ledger.
 */
export async function callAnthropicJson<T>(
  model: string,
  request: GenerateJsonRequest<T>,
  deps: AnthropicDeps = {},
  signal?: AbortSignal,
): Promise<ModelCallResult<T>> {
  const createMessage = deps.createMessage ?? createWithClient
  let message: Anthropic.Message
  try {
    message = await createMessage(
      {
        model,
        max_tokens: request.maxOutputTokens,
        system: request.instructions,
        messages: [{ role: 'user', content: request.input }],
        output_config: { format: { type: 'json_schema', schema: request.schema } },
        ...(request.safetyIdentifier ? { metadata: { user_id: request.safetyIdentifier } } : {}),
      },
      { signal },
    )
  } catch (err) {
    throw classifyAnthropicError(err)
  }
  const billed: BilledModelResponse = {
    provider: 'anthropic',
    transport: 'direct',
    model: message.model,
    responseId: message.id,
    serviceTier: message.usage.service_tier ?? 'standard',
    usage: anthropicUsageToModelUsage(message.usage),
  }
  if (message.stop_reason === 'refusal')
    throw unusable('refusal', 'Anthropic declined the request.', billed)
  if (message.stop_reason === 'max_tokens')
    throw unusable('output-truncated', 'Anthropic output hit max_tokens.', billed)
  const text = message.content.find(block => block.type === 'text')
  if (!text) throw unusable('invalid-response', 'Anthropic returned no text.', billed)
  try {
    return { ...billed, output: parseSchemaValidJson(text.text, request) }
  } catch (err) {
    throw unusable('invalid-response', 'Anthropic output failed validation.', billed, err)
  }
}
