import {
  buildOpenAIToolTurnParams,
  parseOpenAIToolTurn,
  type ToolTurnRequest,
} from '@vouchington/ai/providers'
import { toOpenRouterModel } from '@vouchington/ai/openai'
import { createOpenAIResponse } from '@modules/openai-utils/create-response'
import { createOpenRouterResponse } from '@modules/openrouter-utils'
import type { ToolTurnResult } from './tool-turn-types.mts'

import type { OpenAITransport } from './types.mts'
import type { OpenAIDeps } from './openai-generate.mts'

export async function callOpenAIToolTurn(
  model: string,
  transport: OpenAITransport,
  request: ToolTurnRequest,
  deps: OpenAIDeps = {},
  signal?: AbortSignal,
): Promise<ToolTurnResult> {
  // The app owns the SDK and its input union; the package serializes the provider-neutral turn.
  const params = buildOpenAIToolTurnParams(request) as Parameters<typeof createOpenAIResponse>[0]
  const options =
    request.maxRetries === undefined && !signal
      ? undefined
      : {
          ...(request.maxRetries === undefined ? {} : { maxRetries: request.maxRetries }),
          ...(signal ? { signal } : {}),
        }
  const response =
    transport === 'openrouter'
      ? await (deps.createOpenRouterResponse ?? createOpenRouterResponse)(
          { ...params, model: toOpenRouterModel(model) },
          options,
        )
      : await (deps.createOpenAIResponse ?? createOpenAIResponse)({ ...params, model }, options)
  const result = parseOpenAIToolTurn(response, model, transport)
  return { ...result, provider: 'openai', transport }
}
