/**
 * Test utilities for subagent mock tests.
 *
 * Shared by research-agent, profile-agent, and discovery-agent tool.mock.test.mts.
 * Not exported from the package index — test-only.
 *
 * setupSubagentFixtures lives in backend/agents/_shared/test-helpers/subagent-fixtures.mts
 * instead — it calls real conversations-messages service functions, and this package must
 * never depend on a service that already devDeps this package for its own tests.
 */

import type { OpenAIResponse } from '@modules/openai-utils/create-response'

/** Builds an OpenAI text response for use with vi.mocked(createOpenAIResponse). */
export function createMockTextResponse(id: string, text: string): OpenAIResponse {
  return {
    id,
    status: 'completed',
    output: [
      {
        id: `${id}-message`,
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    output_text: text,
  }
}

/** Builds an OpenAI function-call response for use with vi.mocked(createOpenAIResponse). */
export function createMockFunctionCallResponse(
  id: string,
  callId: string,
  name: string,
  args: string,
): OpenAIResponse {
  return {
    id,
    status: 'completed',
    output: [
      {
        id: `${id}-call`,
        type: 'function_call',
        call_id: callId,
        name,
        arguments: args,
      },
    ],
    output_text: '',
  }
}

/**
 * Drains an async generator executor to completion.
 * Returns the final return value plus any values that were yielded along the way.
 * Generic over the step/result shape so callers don't force a dependency on any
 * specific agent package's event types.
 */
export async function drainSubagentExecutor<TStep, TResult>(
  gen: AsyncGenerator<TStep, TResult>,
): Promise<{ result: TResult; events: TStep[] }> {
  const events: TStep[] = []
  let step = await gen.next()
  while (!step.done) {
    events.push(step.value)
    step = await gen.next()
  }
  return { result: step.value, events }
}
