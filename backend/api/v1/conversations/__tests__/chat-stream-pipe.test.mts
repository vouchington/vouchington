import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Worker, type Job } from 'glide-mq'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import { createConversation } from '@services/conversations-messages/create'
import * as chatSafety from '../../check-api-message-safety.mts'
import { AI_AGENTS_QUEUE_NAME } from '@queues/ai-agents/config'
import type { ChatJobData } from '@queues/ai-agents/types'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { closeChatTokenSubscriber, publishChatToken } from '@data-stores/valkey-pubsub'

const checkApiMessageSafetySpy = vi
  .spyOn(chatSafety, 'checkApiMessageSafety')
  .mockResolvedValue(undefined)

describe('chat SSE pub/sub pipe (worker-backed)', () => {
  let worker: Worker | undefined

  beforeAll(async () => {
    await closeChatTokenSubscriber()
    worker = new Worker(
      AI_AGENTS_QUEUE_NAME,
      async (job: Job<ChatJobData>) => {
        if (job.name !== 'chat') return
        await publishChatToken(job.data.conversationMessageId, {
          type: 'text',
          content: 'mocked reply',
        })
        await publishChatToken(job.data.conversationMessageId, { type: 'done' })
      },
      {
        connection: workerQueueConnection,
        prefix: workerQueuePrefix,
        concurrency: 1,
      },
    )
  })

  beforeEach(() => {
    checkApiMessageSafetySpy.mockResolvedValue(undefined)
  })

  afterAll(async () => {
    await worker?.close()
  })

  it('streams text + done over SSE through the worker via pub/sub', async () => {
    expect(checkApiMessageSafetySpy).toBeDefined()
    expect(worker).toBeDefined()

    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'pubsub bridge test')

    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post(`/api/v1/conversations/${conversation.id}/chat`)
      .send({ message: 'hi' })
      .expect(200)

    expect(response.headers['content-type']).toContain('text/event-stream')
    expect(response.text).toMatch(/^event: metadata\n/)
    const metadata = JSON.parse(response.text.split('\n')[1]!.slice('data: '.length)) as {
      assistant_message_id: string
      job_id: string
    }
    expect(metadata.job_id).toBe(`chat_${metadata.assistant_message_id}`)
    expect(response.text).toContain(conversation.id)
    expect(response.text).toContain('event: text')
    expect(response.text).toContain('mocked reply')
    expect(response.text).toContain('event: done')
  })
})
