import { v7 as uuidv7 } from 'uuid'
import { describe, expect, it } from 'vitest'
import { enqueueChat, getChatJobId } from './chat.mts'

describe('enqueueChat', () => {
  it('uses the assistant message logical ID for the job and deduplication', async () => {
    const conversationMessageId = uuidv7()
    const data = {
      conversationId: uuidv7(),
      conversationMessageId,
      userMessageId: uuidv7(),
      userMessage: 'Hello',
      userId: uuidv7(),
    }

    const job = await enqueueChat(data)
    const jobId = getChatJobId(conversationMessageId)

    expect(job.id).toBe(jobId)
    expect(job.data).toEqual(data)
    expect(job.opts).toMatchObject({
      jobId,
      deduplication: { id: jobId, mode: 'simple' },
    })
  })
})
