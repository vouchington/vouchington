import {
  callAnthropicJson as generate,
  type CreateAnthropicMessage,
  type GenerateJsonRequest,
} from '@vouchington/ai/providers'
import { getAnthropicClient } from './anthropic-client.mts'
import type { ModelCallResult } from './types.mts'
export type AnthropicDeps = { createMessage?: CreateAnthropicMessage }

export async function callAnthropicJson<T>(
  model: string,
  request: GenerateJsonRequest<T>,
  deps: AnthropicDeps = {},
  signal?: AbortSignal,
): Promise<ModelCallResult<T>> {
  const result = await generate(deps.createMessage ?? createWithClient, model, request, signal)
  return { ...result, provider: 'anthropic', transport: 'direct' }
}
/* no-mistakes: integration=anthropic */
function createWithClient(
  ...args: Parameters<CreateAnthropicMessage>
): ReturnType<CreateAnthropicMessage> {
  return getAnthropicClient().messages.create(...args)
}
