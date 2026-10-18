import { createQueue } from '@data-stores/valkey-glide-mq'
import { AI_AGENTS_QUEUE_NAME } from './config.mts'
import type { AIAgentJobData } from './types.mts'

export const ai_agents = createQueue<AIAgentJobData>(AI_AGENTS_QUEUE_NAME, {
  priorityKind: 'ranked',
})
