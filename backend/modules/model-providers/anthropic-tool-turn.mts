import type Anthropic from '@anthropic-ai/sdk'
import { getAnthropicClient } from './anthropic-client.mts'
import { classifyAnthropicError, ModelProviderError } from './errors.mts'
import type {
  AgentTurnMessage,
  ToolCall,
  ToolTurnRequest,
  ToolTurnResult,
} from './tool-turn-types.mts'
import type { BilledModelResponse } from './types.mts'
import { anthropicUsageToModelUsage } from './usage.mts'

type CreateMessage = (
  params: Anthropic.MessageCreateParamsNonStreaming,
  options?: { signal?: AbortSignal },
) => PromiseLike<Anthropic.Message>

export type AnthropicToolDeps = { createMessage?: CreateMessage }

/* v8 ignore start -- thin Anthropic integration wrapper; exercised by credentialed *.anthropic.test.mts */
/* no-mistakes: integration=anthropic */
function createWithClient(
  params: Anthropic.MessageCreateParamsNonStreaming,
  options?: { signal?: AbortSignal },
): PromiseLike<Anthropic.Message> {
  return getAnthropicClient().messages.create(params, options)
}
/* v8 ignore stop */

function toAnthropicMessage(message: AgentTurnMessage): Anthropic.MessageParam {
  if (message.role === 'user') return { role: 'user', content: message.text }
  if (message.role === 'tool') {
    return {
      role: 'user',
      content: message.results.map(result => ({
        type: 'tool_result' as const,
        tool_use_id: result.callId,
        content: result.content,
        ...(result.isError ? { is_error: true } : {}),
      })),
    }
  }
  return {
    role: 'assistant',
    content: [
      ...(message.text ? [{ type: 'text' as const, text: message.text }] : []),
      ...message.toolCalls.map(call => ({
        type: 'tool_use' as const,
        id: call.id,
        name: call.name,
        input: call.input,
      })),
    ],
  }
}

function unusable(
  code: 'refusal' | 'output-truncated' | 'invalid-response',
  message: string,
  billedResponse: BilledModelResponse,
): ModelProviderError {
  return new ModelProviderError(code, message, { retryClass: 'permanent', billedResponse })
}

/**
 * One Messages turn of a tool-using agent. A tool call is required every turn (`tool_choice: any`),
 * so the agent's answer is always a tool call it can validate, never free text. A refusal or a turn
 * cut off at `max_tokens` (whose tool input may be incomplete) is unusable but still billed, so the
 * thrown error carries the billed response for the ledger.
 */
export async function callAnthropicToolTurn(
  model: string,
  request: ToolTurnRequest,
  deps: AnthropicToolDeps = {},
  signal?: AbortSignal,
): Promise<ToolTurnResult> {
  let message: Anthropic.Message
  try {
    message = await (deps.createMessage ?? createWithClient)(
      {
        model,
        max_tokens: request.maxOutputTokens,
        system: request.instructions,
        messages: request.messages.map(toAnthropicMessage),
        tools: request.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
        })),
        tool_choice: { type: 'any' },
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
  const toolCalls: ToolCall[] = []
  let text = ''
  for (const block of message.content) {
    if (block.type === 'text') text += block.text
    if (block.type === 'tool_use')
      toolCalls.push({ id: block.id, name: block.name, input: block.input })
  }
  if (toolCalls.length === 0)
    throw unusable('invalid-response', 'Anthropic returned no tool call.', billed)
  return { ...billed, output: { text, toolCalls } }
}
