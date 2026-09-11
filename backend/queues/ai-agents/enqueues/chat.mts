import type { Job, JobOptions } from 'glide-mq'
import { trackJobEnqueue } from '@services/analytics'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { ChatJobData } from '../types.mts'

export function getChatJobId(conversationMessageId: string): string {
  return `chat_${conversationMessageId}`
}

export async function enqueueChat(data: ChatJobData): Promise<Job<ChatJobData>> {
  const jobId = getChatJobId(data.conversationMessageId)
  const job = await ai_agents.add('chat', data, {
    jobId,
    attempts: 1,
    backoff: AI_AGENTS_DEFAULTS.backoff,
    removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
    removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
    priority: AGENT_PRIORITY['chat'],
    deduplication: {
      id: jobId,
      mode: 'simple',
    },
  } satisfies JobOptions)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'chat')
  return job as Job<ChatJobData>
}
