import { randomUUID } from 'node:crypto'
import { vi } from 'vitest'
import type { AgentModelCaller } from '../../agents/_shared/call-agent-model.mts'
import type { ToolCall, ToolTurnResult } from '../../modules/model-providers/tool-turn-types.mts'
import type { ModelCallResult } from '../../modules/model-providers/types.mts'

/**
 * A billed model answer, as an agent's model caller returns it (typed `never` so it fits any agent): priced (Haiku 5.5 on the standard
 * tier) so the daily spend cap never reads it as an unpriced breach, with a fresh response id so
 * every recorded ledger row is distinct on a shared database.
 */
export function makeModelCallResult(
  output: object | null,
  overrides: Partial<ModelCallResult<never>> = {},
): ModelCallResult<never> {
  return {
    output: output as never,
    provider: 'anthropic',
    transport: 'direct',
    model: 'claude-haiku-5-5',
    responseId: `resp-${randomUUID()}`,
    serviceTier: 'standard',
    usage: {
      inputTokens: 100,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      outputTokens: 20,
      reasoningOutputTokens: 0,
    },
    ...overrides,
  }
}

/** The `{ provider, model }` an agent test passes to the entry point: the default selection. */
export const TEST_MODEL_SELECTION = { provider: 'anthropic', model: 'claude-haiku-5-5' } as const

/** An OpenAI selection, for the tests of OpenAI-shaped failures (a response that did not complete). */
export const TEST_OPENAI_SELECTION = { provider: 'openai', model: 'gpt-6-luna' } as const

/**
 * A mock agent model caller that answers every call with `output`. Typed `never` so it is
 * assignable to any agent's `AgentModelCaller<Output>`; the schema, not this fixture, owns the shape.
 */
export function makeAgentModelCaller(output: object) {
  return vi.fn<AgentModelCaller<never>>(() => Promise.resolve(makeModelCallResult(output)))
}

/** The direct-OpenAI Luna result `callRecordingModelUsage` records, for the background-mode paths. */
export function makeDirectOpenAIResult(
  responseId: string,
  usage: { input_tokens: number; output_tokens: number },
): ModelCallResult<never> {
  return makeModelCallResult(null, {
    provider: 'openai',
    transport: 'direct',
    model: 'gpt-6-luna-2026-10-01',
    responseId,
    serviceTier: 'flex',
    usage: {
      inputTokens: usage.input_tokens,
      cacheReadTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      outputTokens: usage.output_tokens,
      reasoningOutputTokens: 0,
    },
  })
}

/** The call an agent's model caller receives when it runs on Anthropic Haiku 5.5. */
export const ANTHROPIC_HAIKU_CALL = {
  selection: TEST_MODEL_SELECTION,
  openaiTransport: 'openrouter',
} as const

/** One billed tool-using turn: the tool calls the model made, priced like `makeModelCallResult`. */
export function makeToolTurnResult(
  toolCalls: readonly Omit<ToolCall, 'id'>[],
  overrides: Partial<ToolTurnResult> = {},
): ToolTurnResult {
  return {
    ...makeModelCallResult(null),
    output: {
      text: '',
      toolCalls: toolCalls.map(call => ({ ...call, id: `call-${randomUUID()}` })),
    },
    ...overrides,
  }
}
