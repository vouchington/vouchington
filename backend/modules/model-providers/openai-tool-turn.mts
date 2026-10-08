import {
  createOpenAIResponse,
  type OpenAIResponse,
  type OpenAIResponseInput,
  type OpenAIUsage,
} from '@modules/openai-utils/create-response'
import { createOpenRouterResponse, toOpenRouterModel } from '@modules/openrouter-utils'
import { ModelProviderError } from './errors.mts'
import type {
  AgentTurnMessage,
  ToolCall,
  ToolTurnRequest,
  ToolTurnResult,
} from './tool-turn-types.mts'
import type { BilledModelResponse, OpenAITransport } from './types.mts'
import { openAIUsageToModelUsage } from './usage.mts'
import type { OpenAIDeps } from './openai-generate.mts'

const NO_USAGE: OpenAIUsage = { input_tokens: 0, output_tokens: 0 }

type InputItem = Exclude<OpenAIResponseInput, string>[number]

function toInputItems(message: AgentTurnMessage): InputItem[] {
  if (message.role === 'user') return [{ role: 'user', content: message.text }]
  if (message.role === 'tool') {
    return message.results.map(result => ({
      type: 'function_call_output' as const,
      call_id: result.callId,
      output: result.content,
    }))
  }
  return [
    ...(message.text ? [{ role: 'assistant' as const, content: message.text }] : []),
    ...message.toolCalls.map(call => ({
      type: 'function_call' as const,
      call_id: call.id,
      name: call.name,
      arguments: JSON.stringify(call.input),
    })),
  ]
}

function parseArguments(raw: string, billed: BilledModelResponse): unknown {
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new ModelProviderError('invalid-response', 'OpenAI tool arguments are not JSON.', {
      retryClass: 'permanent',
      billedResponse: billed,
      cause: err,
    })
  }
}

/**
 * One OpenAI Responses turn of a tool-using agent. A tool call is required every turn
 * (`tool_choice: required`), so the agent's answer is always a tool call it can validate. Which
 * endpoint serves it (OpenRouter or OpenAI directly) is the global transport setting the caller
 * resolved. A response that did not complete keeps the SDK error, which carries the usage.
 */
export async function callOpenAIToolTurn(
  model: string,
  transport: OpenAITransport,
  request: ToolTurnRequest,
  deps: OpenAIDeps = {},
): Promise<ToolTurnResult> {
  const params = {
    instructions: request.instructions,
    input: request.messages.flatMap(toInputItems),
    max_output_tokens: request.maxOutputTokens,
    tools: request.tools.map(tool => ({
      type: 'function' as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      strict: false,
    })),
    tool_choice: 'required' as const,
    ...(request.safetyIdentifier ? { safety_identifier: request.safetyIdentifier } : {}),
    ...(request.promptCacheKey ? { prompt_cache_key: request.promptCacheKey } : {}),
    ...(request.flex ? { service_tier: 'flex' as const } : {}),
  }
  const options = request.maxRetries === undefined ? undefined : { maxRetries: request.maxRetries }
  const response: OpenAIResponse =
    transport === 'openrouter'
      ? await (deps.createOpenRouterResponse ?? createOpenRouterResponse)(
          { ...params, model: toOpenRouterModel(model) },
          options,
        )
      : await (deps.createOpenAIResponse ?? createOpenAIResponse)({ ...params, model }, options)
  const billed: BilledModelResponse = {
    provider: 'openai',
    transport,
    model: response.model ?? model,
    responseId: response.id,
    serviceTier: response.service_tier ?? 'unknown-tier',
    usage: openAIUsageToModelUsage(response.usage ?? NO_USAGE),
  }
  const toolCalls: ToolCall[] = []
  for (const item of response.output) {
    if (item.type === 'function_call')
      toolCalls.push({
        id: item.call_id,
        name: item.name,
        input: parseArguments(item.arguments, billed),
      })
  }
  if (toolCalls.length === 0) {
    throw new ModelProviderError('invalid-response', 'OpenAI returned no tool call.', {
      retryClass: 'permanent',
      billedResponse: billed,
    })
  }
  return { ...billed, output: { text: response.output_text, toolCalls } }
}
