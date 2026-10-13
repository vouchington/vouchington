import type { GenerateJsonOptions, generateJson } from '../modules/model-providers/generate.mts'
import { createProviderReplay, type ProviderReplay } from './provider-replay.mts'

// Agent packages cannot resolve `@anthropic-ai/sdk`, so their tests cannot replay through the SDK's
// `fetch`. The SDK-level replay lives beside the client, in
// backend/modules/model-providers/generate.replay.no-data.mock.test.mts. This adapter feeds the
// same recorded Messages API bodies to `generateJson` through its `createMessage` dependency, so an
// agent's real schema validation and parser still run against the recorded wire JSON.

type CreateMessage = NonNullable<NonNullable<GenerateJsonOptions['deps']>['createMessage']>

export type AnthropicMessageReplay = ProviderReplay & { createMessage: CreateMessage }

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages'

/**
 * A `createMessage` that answers each call with the next queued recorded 2xx Messages API
 * response. `requests[n].json()` is the request body the call sent. Queue and capture semantics are
 * the shared `createProviderReplay` ones.
 */
export function createAnthropicMessageReplay(): AnthropicMessageReplay {
  const replay = createProviderReplay()
  const createMessage: CreateMessage = async (params, options) => {
    const response = await replay.fetch(MESSAGES_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
      signal: options?.signal,
    })
    if (!response.ok) {
      throw new Error(`Recorded Anthropic response is HTTP ${response.status}, not a message`)
    }
    return (await response.json()) as Awaited<ReturnType<CreateMessage>>
  }
  return { ...replay, createMessage }
}

/**
 * The `generateJson` for a `vi.mock(import('@modules/model-providers/generate'), ...)` factory:
 * the real function, with the replay injected as its Anthropic `createMessage`.
 */
export function replayGenerateJson(
  actual: typeof generateJson,
  replay: AnthropicMessageReplay,
): typeof generateJson {
  return (selection, request, options) =>
    actual(selection, request, {
      ...options,
      deps: { ...options.deps, createMessage: replay.createMessage },
    })
}
