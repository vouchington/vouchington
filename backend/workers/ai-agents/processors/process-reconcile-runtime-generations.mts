import { ai_agents } from '@queues/ai-agents/queues'
import {
  getStaleRuntimeGenerationJobs,
  reconcileStaleRuntimeGenerations,
  RUNTIME_GENERATION_INTERRUPTED_ERROR,
  RUNTIME_GENERATION_INTERRUPTED_SIGNAL,
} from '@services/agent-responses/reconcile-runtime-generations'
import onError from '@modules/on-error'
import { CHAT_SSE_CYCLE_EXPIRED } from '@agents/chat/stream-lifecycle'
import { publishAgentResponseEvent } from '@data-stores/valkey-pubsub'

export type ReconcileRuntimeGenerationDeps = {
  getStaleRuntimeGenerationJobs: typeof getStaleRuntimeGenerationJobs
  reconcileStaleRuntimeGenerations: typeof reconcileStaleRuntimeGenerations
  signalJob: (jobId: string, signalName: string) => Promise<unknown>
  publishAgentResponseEvent: typeof publishAgentResponseEvent
}

const defaultDeps: ReconcileRuntimeGenerationDeps = {
  getStaleRuntimeGenerationJobs,
  reconcileStaleRuntimeGenerations,
  signalJob: (jobId, signalName) => ai_agents.signal(jobId, signalName),
  publishAgentResponseEvent,
}

export async function processReconcileRuntimeGenerations(
  dependencyOverrides: Partial<ReconcileRuntimeGenerationDeps> = {},
): Promise<void> {
  const deps = { ...defaultDeps, ...dependencyOverrides }
  const batch = await deps.getStaleRuntimeGenerationJobs()
  await Promise.all(
    batch.candidates.map(candidate =>
      deps
        .signalJob(
          candidate.signalJobId,
          candidate.kind === 'chat'
            ? CHAT_SSE_CYCLE_EXPIRED
            : RUNTIME_GENERATION_INTERRUPTED_SIGNAL,
        )
        .catch(error => {
          onError(error)
        }),
    ),
  )
  const result = await deps.reconcileStaleRuntimeGenerations(batch)
  await Promise.all(
    result.agentResponseIds.map(agentResponseId =>
      deps
        .publishAgentResponseEvent(agentResponseId, {
          type: 'error',
          error: RUNTIME_GENERATION_INTERRUPTED_ERROR,
        })
        .catch(error => {
          onError(error)
        }),
    ),
  )
}
