import { callAnthropicToolTurn, type AnthropicToolDeps } from './anthropic-tool-turn.mts'
import { assertSupportedRequest } from './generate.mts'
import type { OpenAIDeps } from './openai-generate.mts'
import { callOpenAIToolTurn } from './openai-tool-turn.mts'
import type { ToolTurnRequest, ToolTurnResult } from './tool-turn-types.mts'
import type { ModelSelection, OpenAITransport } from './types.mts'

export type GenerateToolTurnOptions = {
  /** The global OpenAI transport setting; read by the agent layer, never chosen per agent. */
  openaiTransport: OpenAITransport
  signal?: AbortSignal
  deps?: AnthropicToolDeps & OpenAIDeps
}

/**
 * One turn of a tool-using agent on whichever provider the caller selected. Every result carries
 * the served model, response id and provider-neutral usage, and requires at least one tool call;
 * a billed turn that cannot be used is a `ModelProviderError` carrying its billed response.
 */
/* no-mistakes: integration=anthropic */
/* no-mistakes: integration=openai */
export async function generateToolTurn(
  selection: ModelSelection,
  request: ToolTurnRequest,
  options: GenerateToolTurnOptions,
): Promise<ToolTurnResult> {
  assertSupportedRequest(selection, {})
  if (selection.provider === 'anthropic')
    return callAnthropicToolTurn(selection.model, request, options.deps, options.signal)
  return callOpenAIToolTurn(
    selection.model,
    options.openaiTransport,
    request,
    options.deps,
    options.signal,
  )
}
