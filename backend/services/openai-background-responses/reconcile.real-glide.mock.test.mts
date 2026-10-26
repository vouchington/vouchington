import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { Responses } from 'openai/resources/responses/responses'
import { describe, expect, it, vi } from 'vitest'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../../data-stores/valkey-core/glide-mq-client.mts'
import {
  countAiUsageRecordsForResponseId,
  findAiUsageRecordForResponseId,
} from '@voucha/test-helpers'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users-direct'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { hardDeleteTestPost } from '@voucha/test-helpers/entities/posts-deletion'
import {
  hardDeleteTestCommunity,
  insertTestCommunity,
} from '@voucha/test-helpers/entities/communities'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { makeSdkTextResponse } from '@voucha/test-helpers/modules/openai-utils/responses'
import type { AIAgentJobData } from '../../queues/ai-agents/types.mts'
import { recordAiUsage } from '@services/ai-usage'
import { processAIAgentWorkerJob } from '../../workers/ai-agents/workers/core.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('recovered AI response scope after a hard delete', () => {
  it('records once with null post and community scopes and clears the pending job ID', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'owned-deleted-scope-provider-fixture')
    const owner = await createTestUserDirect()
    const community = await insertTestCommunity({ createdById: owner.id })
    const postId = await insertTestPost({
      title: `Deleted response scope ${randomUUID()}`,
      slug: `deleted-response-scope-${randomUUID()}`,
      createdById: owner.id,
      markdown: '',
      postType: 'story',
      communityId: community.id,
    })
    const response = {
      responseId: `resp_${randomUUID()}`,
      agentSlug: `deleted-scope-${randomUUID()}`,
      communityId: community.id,
      postId,
      createdAt: new Date().toISOString(),
    }
    const name = `ai_deleted_response_scope_${randomUUID()}`
    const queue = new Queue<AIAgentJobData>(name, {
      connection: workerQueueConnection,
      prefix: workerQueuePrefix,
    })
    const admitted = await queue.add(
      'story-post',
      { post_id: postId, backgroundResponses: [response] },
      { removeOnFail: false },
    )
    if (!admitted) throw new Error('Expected an admitted job')
    await hardDeleteTestPost(postId)
    await hardDeleteTestCommunity(community.id)

    // This is the old job-replay failure: a Valkey ID outlives the nullable PostgreSQL FK.
    await expect(
      recordAiUsage({
        responseId: response.responseId,
        agentSlug: response.agentSlug,
        postId,
        communityId: community.id,
        provider: 'openai',
        transport: 'direct',
        model: 'gpt-6-luna-2026-10-01',
        serviceTier: 'flex',
        usage: {
          inputTokens: 13,
          cacheReadTokens: 0,
          cacheWrite5mTokens: 0,
          cacheWrite1hTokens: 0,
          outputTokens: 5,
          reasoningOutputTokens: 0,
        },
      }),
    ).rejects.toMatchObject({ code: '23503' })

    const retrieve = vi.spyOn(Responses.prototype, 'retrieve')
    retrieve.mockResolvedValueOnce(
      makeSdkTextResponse('done', {
        id: response.responseId,
        model: 'gpt-6-luna-2026-10-01',
        service_tier: 'flex',
        usage: {
          input_tokens: 13,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          output_tokens: 5,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 18,
        },
      }),
    )
    const completed = Promise.withResolvers<void>()
    const worker = new Worker<AIAgentJobData>(
      name,
      (job: Job<AIAgentJobData>) => processAIAgentWorkerJob(job),
      { connection: workerQueueConnection, prefix: workerQueuePrefix, blockTimeout: 1_000 },
    )
    worker.on('completed', job => {
      if (job.id === admitted.id) completed.resolve()
    })
    worker.on('failed', (job, error) => {
      if (job?.id === admitted.id) completed.reject(error)
    })
    worker.on('error', completed.reject)
    try {
      await waitForRealGlideEvent(completed.promise, `AI deleted scope ${admitted.id}`)
      await expect(findAiUsageRecordForResponseId(response.responseId)).resolves.toMatchObject({
        post_id: null,
        community_id: null,
        agent_slug: response.agentSlug,
        input_tokens: 13,
        output_tokens: 5,
      })
      await expect(countAiUsageRecordsForResponseId(response.responseId)).resolves.toBe(1)
      expect((await queue.getJob(admitted.id))?.data.backgroundResponses).toEqual([])
      expect(retrieve).toHaveBeenCalledOnce()
    } finally {
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
      retrieve.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
