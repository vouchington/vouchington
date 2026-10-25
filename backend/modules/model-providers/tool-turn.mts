import {
  type ToolTurnRequest,
  type ToolTurnResult,
  callAnthropicToolTurn,
  callOpenAIToolTurn,
} from '@vouchington/ai/providers'
import {
  createAnthropicMessage,
  openAIResponseCreator,
  type AnthropicDeps,
  type OpenAIDeps,
} from './clients.mts'
import { assertSupportedRequest } from './generate.mts'
import type { ModelSelection, OpenAITransport } from './types.mts'

export type GenerateToolTurnOptions = {
  /** The global OpenAI transport setting; read by the agent layer, never chosen per agent. */
  openaiTransport: OpenAITransport
  signal?: AbortSignal
  deps?: AnthropicDeps & OpenAIDeps
}

/**
 * One turn of a tool-using agent on whichever provider the caller selected. Every result requires
 * at least one tool call; a billed turn that cannot be used is a `ModelProviderError` carrying its
 * billed response.
 */
/* no-mistakes: integration=anthropic */
/* no-mistakes: integration=openai */
export async function generateToolTurn(
  selection: ModelSelection,
  request: ToolTurnRequest,
  options: GenerateToolTurnOptions,
): Promise<ToolTurnResult> {
  assertSupportedRequest(selection, {})
  if (selection.provider === 'anthropic') {
    const createMessage = options.deps?.createMessage ?? createAnthropicMessage
    return callAnthropicToolTurn(createMessage, selection.model, request, options.signal)
  }
  const create = openAIResponseCreator(options.openaiTransport, options.deps)
  return callOpenAIToolTurn(
    create,
    selection.model,
    options.openaiTransport,
    request,
    options.signal,
  )
}
