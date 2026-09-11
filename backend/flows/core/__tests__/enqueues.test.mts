import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { ai_agents } from '@queues/ai-agents/queues'
import { bedrock_embeddings_nova_multimodal_v1_single } from '@queues/bedrock-embeddings/queues'
import { openai_moderation_omni_single } from '@queues/openai-moderation/queues'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { enqueuePostAutotaggerFlow } from '../enqueues.mts'

describe('core flow enqueues', () => {
  beforeEach(async () => {
    await ai_agents.obliterate({ force: true })
    await bedrock_embeddings_nova_multimodal_v1_single.obliterate({ force: true })
    await openai_moderation_omni_single.obliterate({ force: true })
  })

  it('enqueues the autotagger flow without moderation when disabled', async () => {
    const postId = `post-${randomUUID()}`

    await enqueuePostAutotaggerFlow(postId, { includeModeration: false, priority: 42 })

    const aiJobs = await readAllQueueJobs(ai_agents)
    const aiJob = aiJobs.find(job => job.name === 'autotagger-post')
    expect(aiJob).toBeDefined()
    expect(aiJob?.data).toEqual({ id: postId })
    expect(aiJob?.opts).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: 42,
    })

    const embeddingJobs = await bedrock_embeddings_nova_multimodal_v1_single.getJobs('waiting')
    const embeddingJob = embeddingJobs.find(job => job.name === 'post')
    expect(embeddingJob).toBeDefined()
    expect(embeddingJob?.data).toEqual({ id: postId })
    expect(embeddingJob?.opts).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
      priority: 42,
    })

    await expect(openai_moderation_omni_single.getJobs('waiting')).resolves.toEqual([])
  })

  it('enqueues moderation alongside embeddings by default', async () => {
    const postId = `post-${randomUUID()}`

    await enqueuePostAutotaggerFlow(postId)

    const moderationJobs = await openai_moderation_omni_single.getJobs('waiting')
    const moderationJob = moderationJobs.find(job => job.name === 'post')
    expect(moderationJob).toBeDefined()
    expect(moderationJob?.data).toEqual({ id: postId })
    expect(moderationJob?.opts).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
    })
  })
})
