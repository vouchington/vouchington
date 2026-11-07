import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { AI_AGENTS_QUEUE_NAME } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { AIAgentJobPayloads } from '../types.mts'

export function createAIAgentEnqueue<TName extends keyof AIAgentJobPayloads>(jobName: TName) {
  return createEnqueueFunction<AIAgentJobPayloads[TName], TName>({
    queue: ai_agents,
    queueName: AI_AGENTS_QUEUE_NAME,
    jobName,
  })
}

export function addAIAgentJob<TName extends keyof AIAgentJobPayloads>(
  jobName: TName,
  data: AIAgentJobPayloads[TName],
  options?: Partial<JobOptions>,
) {
  return ai_agents.add(jobName, data, options)
}
