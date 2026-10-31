import { createHash } from 'node:crypto'
import { runAgentModerationRetentionCleanupPage } from '@services/data-retention'
import { dataRetentionConfig, getDataRetentionLimits } from '@services/data-retention/config'
import { enqueueAgentModerationRetentionContinuation } from '@queues/psql/enqueues'
import type { AgentModerationRetentionContinuationData } from '@queues/psql/types'

export type AgentModerationRetentionDependencies = {
  agentModerationRetentionCleanupPage?: typeof runAgentModerationRetentionCleanupPage
  enqueueAgentModerationRetentionContinuation?: typeof enqueueAgentModerationRetentionContinuation
}

export async function processAgentModerationRetentionContinuation(
  data: Partial<AgentModerationRetentionContinuationData> | undefined,
  dependencies?: AgentModerationRetentionDependencies,
) {
  if (!data?.agentModerationRetention || !data?.runId || !data.step) {
    throw new Error('Agent moderation retention continuation requires its cursor')
  }
  await dataRetentionConfig.waitForInitialization()
  const result = await (
    dependencies?.agentModerationRetentionCleanupPage ?? runAgentModerationRetentionCleanupPage
  )(getDataRetentionLimits(), data.agentModerationRetention)
  if (result.continuation) {
    await (
      dependencies?.enqueueAgentModerationRetentionContinuation ??
      enqueueAgentModerationRetentionContinuation
    )({
      runId: data.runId,
      step: data.step + 1,
      agentModerationRetention: result.continuation,
    })
  }
  return result
}

/** The first cleanup run starts the ordered agent moderation chain from its own cursor. */
export async function startAgentModerationRetentionContinuation(
  continuation: AgentModerationRetentionContinuationData['agentModerationRetention'] | null,
  jobId: string | undefined,
  dependencies?: AgentModerationRetentionDependencies,
) {
  if (!continuation) return
  if (!jobId) throw new Error('Agent moderation retention continuation needs the current job ID')
  await (
    dependencies?.enqueueAgentModerationRetentionContinuation ??
    enqueueAgentModerationRetentionContinuation
  )({
    runId: createHash('sha256').update(jobId).digest('hex'),
    step: 1,
    agentModerationRetention: continuation,
  })
}
