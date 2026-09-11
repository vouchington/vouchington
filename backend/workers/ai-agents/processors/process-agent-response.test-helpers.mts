import type { Job } from 'glide-mq'
import type { AgentResponseJobData } from '@queues/ai-agents/types'
import { subscribeAgentResponseEvents, type AgentResponseEvent } from '@data-stores/valkey-pubsub'
import type { OpenAIResponse } from '@modules/openai-utils/create-response'
import { getAgentResponseJobId } from '@queues/ai-agents/enqueues/agent-response'
import { openAiSpendCapConfig } from '@services/ai-usage'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'

// Insulates tests from real, unmocked mid-loop spend-cap breaches against the dirty shared test DB.
export async function disableOpenAiSpendCapForTests(): Promise<() => void> {
  await openAiSpendCapConfig.waitForInitialization()
  return overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, { enabled: false })
}

export function makeNoTextStream(response: OpenAIResponse) {
  return async function* (): AsyncGenerator<{ delta: string }, OpenAIResponse> {
    yield* []
    return response
  }
}

export function makeTextResponse(id: string, text: string): OpenAIResponse {
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

export function makeJob(
  agentResponseId: string,
  signals?: Array<{ name: string }>,
  jobId = getAgentResponseJobId(agentResponseId),
): Job<AgentResponseJobData> {
  return {
    id: jobId,
    name: 'agent-response',
    data: { agentResponseId },
    signals: signals ?? [],
  } as unknown as Job<AgentResponseJobData>
}

export function createDeferred() {
  let resolve!: () => void
  let reject!: (error: Error) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

export async function subscribeAgentResponseEventLog(agentResponseId: string) {
  const events: AgentResponseEvent[] = []
  const subscription = await subscribeAgentResponseEvents(agentResponseId)
  subscription.setHandler(event => events.push(event))
  return { events, subscription }
}
