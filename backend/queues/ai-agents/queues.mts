import { createQueue } from '@data-stores/valkey-glide-mq'
import { AI_AGENTS_QUEUE_NAME, OPENAI_SPEND_CAP_RECHECKS_QUEUE_NAME } from './config.mts'
import type { AIAgentJobData, OpenAiSpendCapRecheckJobData } from './types.mts'

export const ai_agents = createQueue<AIAgentJobData>(AI_AGENTS_QUEUE_NAME)

export const openAiSpendCapRechecks = createQueue<OpenAiSpendCapRecheckJobData>(
  OPENAI_SPEND_CAP_RECHECKS_QUEUE_NAME,
)
