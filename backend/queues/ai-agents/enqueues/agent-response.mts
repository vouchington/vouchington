import type { Job, JobOptions } from 'glide-mq'
import { trackJobEnqueue } from '@services/analytics'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { AgentResponseJobData } from '../types.mts'

export function getAgentResponseJobId(agentResponseId: string): string {
  return `agent-response_${agentResponseId}`
}

export async function enqueueAgentResponse(
  agentResponseId: string,
): Promise<Job<AgentResponseJobData>> {
  const data: AgentResponseJobData = { agentResponseId }
  const jobId = getAgentResponseJobId(agentResponseId)
  const job = await ai_agents.add('agent-response', data, {
    jobId,
    attempts: 1,
    backoff: AI_AGENTS_DEFAULTS.backoff,
    removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
    removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
    priority: AGENT_PRIORITY['agent-response'],
    deduplication: {
      id: jobId,
      mode: 'simple',
    },
  } satisfies JobOptions)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'agent-response')
  return job as Job<AgentResponseJobData>
}
