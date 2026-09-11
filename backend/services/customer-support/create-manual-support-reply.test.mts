import { describe, expect, it } from 'vitest'
import { createSystemUser } from '@voucha/test-helpers'
import { resolveTestSupportThreadWhileLocked } from '@voucha/test-helpers/entities/support-threads'
import {
  createManualSupportReply,
  createSupportThread,
  getOrCreateSupportContactByEmail,
  getSupportMessagesByThreadId,
} from './index.mts'

describe('createManualSupportReply', () => {
  it('rejects a reply when resolution commits while the reply waits on the thread lock', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const [author, contact] = await Promise.all([
      createSystemUser(`support-reply-race-${suffix}`),
      getOrCreateSupportContactByEmail(`tests+support-reply-race-${suffix}@voucha.ai`),
    ])
    const thread = await createSupportThread(contact.id, `Reply race ${suffix}`)
    let releaseResolution: (() => void) | undefined
    const resolutionCanCommit = new Promise<void>(resolve => {
      releaseResolution = resolve
    })
    let threadLocked: (() => void) | undefined
    const waitForThreadLock = new Promise<void>(resolve => {
      threadLocked = resolve
    })
    const resolution = resolveTestSupportThreadWhileLocked(
      thread.id,
      author.id,
      () => threadLocked?.(),
      resolutionCanCommit,
    )
    await waitForThreadLock

    const reply = createManualSupportReply(thread.id, {
      bodyText: 'This reply loses to the resolution.',
      createdById: author.id,
    })
    releaseResolution?.()
    await resolution
    await expect(reply).resolves.toEqual({ status: 'resolved' })
    await expect(getSupportMessagesByThreadId(thread.id)).resolves.toMatchObject({ results: [] })
  })

  it('enqueues an accepted reply only after its transaction commits', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const [author, contact] = await Promise.all([
      createSystemUser(`support-reply-commit-${suffix}`),
      getOrCreateSupportContactByEmail(`tests+support-reply-commit-${suffix}@voucha.ai`),
    ])
    const thread = await createSupportThread(contact.id, `Reply commit ${suffix}`)
    let messageCountAtEnqueue = 0

    await createManualSupportReply(
      thread.id,
      { bodyText: 'Committed before embedding.', createdById: author.id },
      {
        enqueueEmbedding: async () => {
          const messages = await getSupportMessagesByThreadId(thread.id)
          messageCountAtEnqueue = messages.results.length
        },
      },
    )

    expect(messageCountAtEnqueue).toBe(1)
  })

  it('keeps a committed reply successful when post-commit embedding fails', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const [author, contact] = await Promise.all([
      createSystemUser(`support-reply-enqueue-failure-${suffix}`),
      getOrCreateSupportContactByEmail(`tests+support-reply-enqueue-failure-${suffix}@voucha.ai`),
    ])
    const thread = await createSupportThread(contact.id, `Reply enqueue failure ${suffix}`)
    const result = await createManualSupportReply(
      thread.id,
      { bodyText: 'Persist despite embedding failure.', createdById: author.id },
      {
        enqueueEmbedding: () => {
          throw new Error('embedding unavailable')
        },
      },
    )
    expect(result.status).toBe('created')
    await expect(getSupportMessagesByThreadId(thread.id)).resolves.toMatchObject({
      results: [
        expect.objectContaining({ id: result.status === 'created' ? result.message.id : '' }),
      ],
    })
  })
})
