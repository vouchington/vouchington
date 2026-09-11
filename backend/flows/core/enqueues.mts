import { trackJobEnqueue } from '@services/analytics'
import type { FlowJob, JobOptions } from 'glide-mq'
import onError from '@modules/on-error'
import { AI_AGENTS_QUEUE_NAME, AGENT_PRIORITY, AI_AGENTS_DEFAULTS } from '@queues/ai-agents/config'
import {
  BEDROCK_EMBEDDINGS_DEFAULTS,
  EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME,
  PRIORITY_DEFAULT as EMBEDDINGS_PRIORITY_DEFAULT,
} from '@queues/bedrock-embeddings/config'
import {
  MODERATION_OMNI_SINGLE_QUEUE_NAME,
  PRIORITY_DEFAULT as MODERATION_PRIORITY_DEFAULT,
} from '@queues/openai-moderation/config'
import { flowProducer } from './queues.mts'

type AutotaggerFlowJobData = {
  id: string
}

type BedrockEmbeddingsFlowJobData = {
  id?: string
}

type OpenAIModerationJobData = {
  id?: string
}

type EnqueuePostAutotaggerFlowOptions = {
  includeModeration?: boolean
  priority?: number
}

export function enqueuePostAutotaggerFlow(
  postId: string,
  options: EnqueuePostAutotaggerFlowOptions = {},
): Promise<void> {
  const { includeModeration = true, priority } = options
  const children = [
    {
      name: 'post',
      queueName: EMBEDDINGS_NOVA_MULTIMODAL_V1_SINGLE_QUEUE_NAME,
      data: { id: postId } satisfies BedrockEmbeddingsFlowJobData,
      opts: {
        attempts: 3,
        backoff: BEDROCK_EMBEDDINGS_DEFAULTS.backoff,
        removeOnComplete: BEDROCK_EMBEDDINGS_DEFAULTS.removeOnComplete,
        removeOnFail: BEDROCK_EMBEDDINGS_DEFAULTS.removeOnFail,
        priority: priority ?? EMBEDDINGS_PRIORITY_DEFAULT,
      } satisfies JobOptions,
    },
  ]

  if (includeModeration) {
    children.push({
      name: 'post',
      queueName: MODERATION_OMNI_SINGLE_QUEUE_NAME,
      data: { id: postId } satisfies OpenAIModerationJobData,
      opts: {
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 1000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: priority ?? MODERATION_PRIORITY_DEFAULT,
      } satisfies JobOptions,
    })
  }

  const flow = {
    name: 'autotagger-post',
    queueName: AI_AGENTS_QUEUE_NAME,
    data: { id: postId } satisfies AutotaggerFlowJobData,
    opts: {
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
      removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
      removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
      priority: priority ?? AGENT_PRIORITY['autotagger-post'],
    } satisfies JobOptions,
    children,
  } satisfies FlowJob

  return flowProducer
    .add(flow)
    .then(() => {
      trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'autotagger-post')
      return undefined
    })
    .catch(onError)
}
