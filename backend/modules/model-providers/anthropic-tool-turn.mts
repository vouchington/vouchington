import {
  callAnthropicToolTurn as generate,
  type CreateAnthropicMessage,
  type ToolTurnRequest,
} from '@vouchington/ai/providers'
import { getAnthropicClient } from './anthropic-client.mts'
import type { ToolTurnResult } from './tool-turn-types.mts'
export type AnthropicToolDeps = { createMessage?: CreateAnthropicMessage }

export async function callAnthropicToolTurn(
  model: string,
  request: ToolTurnRequest,
  deps: AnthropicToolDeps = {},
  signal?: AbortSignal,
): Promise<ToolTurnResult> {
  const result = await generate(deps.createMessage ?? createWithClient, model, request, signal)
  return { ...result, provider: 'anthropic', transport: 'direct' }
}
/* no-mistakes: integration=anthropic */
function createWithClient(
  ...args: Parameters<CreateAnthropicMessage>
): ReturnType<CreateAnthropicMessage> {
  return getAnthropicClient().messages.create(...args)
}
