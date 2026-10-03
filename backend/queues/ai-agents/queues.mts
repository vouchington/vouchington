import { createQueue } from '@data-stores/valkey-glide-mq'
import { AI_AGENTS_QUEUE_NAME, SPEND_CAP_RECHECKS_QUEUE_NAME } from './config.mts'
import type { AIAgentJobData, SpendCapRecheckJobData } from './types.mts'

export const ai_agents = createQueue<AIAgentJobData>(AI_AGENTS_QUEUE_NAME)

export const spendCapRechecks = createQueue<SpendCapRecheckJobData>(SPEND_CAP_RECHECKS_QUEUE_NAME)
