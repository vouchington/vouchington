import { describe, it, expect, beforeAll } from 'vitest'
import { insertTestSupportContact } from '@voucha/test-helpers'
import { createSupportThreadWithInitialMessage } from './create-support-thread-with-initial-message.mts'
import { getSupportAgentJobsFor, getSupportMessageEmbeddingJobsFor } from './queue-test-helpers.mts'
import { getMemberSupportAgentJobId } from './automatic-support-agent-intent.mts'
import { getSupportAgentRunByIdempotencyKey } from './get-support-agent-run-by-idempotency-key.mts'

describe('createSupportThreadWithInitialMessage', () => {
  const rand = () => Math.random().toString(36).slice(2, 10)

  let contactId: string

  beforeAll(async () => {
    const contact = await insertTestSupportContact({
      emailAddress: `tests+support-${rand()}@voucha.ai`,
    })
    contactId = contact.id
  })

  it('keeps thread and message enqueue suppression when outer options include skipEnqueue', async () => {
    const suffix = rand()
    const thread = await createSupportThreadWithInitialMessage(
      contactId,
      `Thread with suppressed enqueues ${suffix}`,
      {
        message: `Initial message ${suffix}`,
        agentModelName: 'gpt-5.4-nano',
        agentModelProvider: 'openai',
        skipEnqueue: false,
      } as Parameters<typeof createSupportThreadWithInitialMessage>[2] & { skipEnqueue: boolean },
    )

    await expect.poll(async () => (await getSupportAgentJobsFor(thread.thread.id)).length).toBe(1)
    expect(thread.message).toBeDefined()
    const logicalJobId = getMemberSupportAgentJobId(thread.message!.id)
    await expect(getSupportAgentRunByIdempotencyKey(logicalJobId)).resolves.toMatchObject({
      support_thread_id: thread.thread.id,
      support_message_id: thread.message!.id,
      claim_token: null,
    })
    await expect
      .poll(async () => (await getSupportAgentJobsFor(thread.thread.id))[0]?.id)
      .toBe(logicalJobId)
    await expect
      .poll(
        async () =>
          (await getSupportMessageEmbeddingJobsFor(thread.thread.id, thread.message!.id)).length,
      )
      .toBe(1)
  })
})
