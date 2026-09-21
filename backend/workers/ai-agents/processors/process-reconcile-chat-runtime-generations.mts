import { CHAT_SSE_CYCLE_EXPIRED } from '@agents/chat/stream-lifecycle'
import onError from '@modules/on-error'
import { ai_agents } from '@queues/ai-agents/queues'
import {
  getStaleChatRuntimeGenerationJobs,
  reconcileStaleChatRuntimeGenerations,
} from '@services/conversations-messages/reconcile-stale-chat-generations'

export type ReconcileChatRuntimeGenerationDeps = {
  getStaleChatRuntimeGenerationJobs: typeof getStaleChatRuntimeGenerationJobs
  reconcileStaleChatRuntimeGenerations: typeof reconcileStaleChatRuntimeGenerations
  signalJob: (jobId: string, signalName: string) => Promise<unknown>
}

const defaultDeps: ReconcileChatRuntimeGenerationDeps = {
  getStaleChatRuntimeGenerationJobs,
  reconcileStaleChatRuntimeGenerations,
  signalJob: (jobId, signalName) => ai_agents.signal(jobId, signalName),
}

export async function processReconcileChatRuntimeGenerations(
  dependencyOverrides: Partial<ReconcileChatRuntimeGenerationDeps> = {},
): Promise<void> {
  const deps = { ...defaultDeps, ...dependencyOverrides }
  const batch = await deps.getStaleChatRuntimeGenerationJobs()
  await Promise.all(
    batch.candidates.map(candidate =>
      deps.signalJob(candidate.signalJobId, CHAT_SSE_CYCLE_EXPIRED).catch(error => {
        onError(error)
      }),
    ),
  )
  await deps.reconcileStaleChatRuntimeGenerations(batch)
}
