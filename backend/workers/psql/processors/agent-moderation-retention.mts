import { runAgentModerationRetentionCleanupPage } from '@services/data-retention'
import { dataRetentionConfig, getDataRetentionLimits } from '@services/data-retention/config'
import { enqueueAgentModerationRetentionContinuation } from '@queues/psql/enqueues'
import type { AgentModerationRetentionContinuationData } from '@queues/psql/types'

type Dependencies = {
  agentModerationRetentionCleanupPage?: typeof runAgentModerationRetentionCleanupPage
  enqueueAgentModerationRetentionContinuation?: typeof enqueueAgentModerationRetentionContinuation
}

export async function processAgentModerationRetentionContinuation(
  data: Partial<AgentModerationRetentionContinuationData> | undefined,
  dependencies?: Dependencies,
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
