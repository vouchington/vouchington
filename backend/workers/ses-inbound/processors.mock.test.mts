import { describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { UnrecoverableError } from '@modules/queue-errors'
import type { SesInboundProcessJobData } from '@ts-shared/ses-inbound-contract'
import { SesInboundTerminalError, type ParsedSesInboundEmail } from './processors/mime.mts'
import { processSesInboundEmail, reconcileSesInboundEmails } from './processors.mts'

vi.mock<typeof import('mailparser')>(
  import('mailparser'),
  async importOriginal => await importOriginal(),
)

const data: SesInboundProcessJobData = {
  sesMessageId: 'ses-test-message',
  objectKey: 'incoming/ses-test-message',
}

function parsedEmail(): ParsedSesInboundEmail {
  return {
    fromEmail: 'tests+sender@voucha.ai',
    subject: 'Help',
    bodyText: 'Please help.',
    emailMessageId: null,
    replyRefs: [],
  }
}

describe('SES inbound processors', () => {
  it('rejects a message ID that does not match the object key before deleting anything', async () => {
    const deleteObject = vi.fn<(objectKey: string) => Promise<void>>()

    await expect(
      processSesInboundEmail(
        { sesMessageId: 'different-id', objectKey: data.objectKey },
        { deleteSesInboundObject: deleteObject },
      ),
    ).rejects.toThrow('must match its S3 object key')
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('persists an email and deletes the completed source object', async () => {
    const createMessage = vi.fn<() => Promise<{ is_new: false }>>().mockResolvedValue({
      is_new: false,
    })
    const deleteObject = vi.fn<(objectKey: string) => Promise<void>>().mockResolvedValue(undefined)

    await processSesInboundEmail(data, {
      isInboundSupportEmailComplete: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
      loadSesInboundObject: vi
        .fn<() => Promise<Readable>>()
        .mockResolvedValue(Readable.from([Buffer.from('raw')])),
      parseSesInboundMime: vi
        .fn<() => Promise<ParsedSesInboundEmail>>()
        .mockResolvedValue(parsedEmail()),
      createInboundSupportEmailMessage: createMessage,
      deleteSesInboundObject: deleteObject,
    })

    expect(createMessage).toHaveBeenCalledWith({
      sesMessageId: data.sesMessageId,
      s3ObjectKey: data.objectKey,
      ...parsedEmail(),
      emailTo: 'support@voucha.ai',
    })
    expect(deleteObject).toHaveBeenCalledWith(data.objectKey)
  })

  it('deletes an already-completed receipt without loading its source object', async () => {
    const loadObject = vi.fn<(objectKey: string) => Promise<Readable>>()
    const createMessage = vi.fn<() => Promise<{ is_new: false }>>()
    const deleteObject = vi.fn<(objectKey: string) => Promise<void>>().mockResolvedValue(undefined)

    await processSesInboundEmail(data, {
      isInboundSupportEmailComplete: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
      loadSesInboundObject: loadObject,
      createInboundSupportEmailMessage: createMessage,
      deleteSesInboundObject: deleteObject,
    })

    expect(deleteObject).toHaveBeenCalledWith(data.objectKey)
    expect(loadObject).not.toHaveBeenCalled()
    expect(createMessage).not.toHaveBeenCalled()
  })

  it('moves terminal MIME failures to the failed prefix', async () => {
    const moveObject = vi
      .fn<(objectKey: string, sesMessageId: string) => Promise<void>>()
      .mockResolvedValue(undefined)

    await expect(
      processSesInboundEmail(data, {
        isInboundSupportEmailComplete: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
        loadSesInboundObject: vi
          .fn<() => Promise<Readable>>()
          .mockRejectedValue(new SesInboundTerminalError('invalid MIME')),
        moveSesInboundObjectToFailed: moveObject,
      }),
    ).rejects.toBeInstanceOf(UnrecoverableError)
    expect(moveObject).toHaveBeenCalledWith(data.objectKey, data.sesMessageId)
  })

  it('leaves transient failures retryable without moving or deleting the source object', async () => {
    const transientError = new Error('S3 temporarily unavailable')
    const moveObject = vi.fn<(objectKey: string, sesMessageId: string) => Promise<void>>()
    const deleteObject = vi.fn<(objectKey: string) => Promise<void>>()

    await expect(
      processSesInboundEmail(data, {
        isInboundSupportEmailComplete: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
        loadSesInboundObject: vi.fn<() => Promise<Readable>>().mockRejectedValue(transientError),
        moveSesInboundObjectToFailed: moveObject,
        deleteSesInboundObject: deleteObject,
      }),
    ).rejects.toBe(transientError)
    expect(moveObject).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('leaves mid-stream S3 failures retryable without moving the source object', async () => {
    const sourceError = new Error('S3 response stream failed')
    async function* failingSource(): AsyncGenerator<Buffer> {
      yield Buffer.from('From: tests+sender@voucha.ai\r\n\r\n')
      throw sourceError
    }
    const moveObject = vi.fn<(objectKey: string, sesMessageId: string) => Promise<void>>()
    const deleteObject = vi.fn<(objectKey: string) => Promise<void>>()

    await expect(
      processSesInboundEmail(data, {
        isInboundSupportEmailComplete: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
        loadSesInboundObject: vi
          .fn<() => Promise<Readable>>()
          .mockResolvedValue(Readable.from(failingSource())),
        moveSesInboundObjectToFailed: moveObject,
        deleteSesInboundObject: deleteObject,
      }),
    ).rejects.toBe(sourceError)
    expect(moveObject).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })

  it('reconciles every valid incoming object page', async () => {
    const listObjects = vi
      .fn<
        (
          continuationToken?: string,
        ) => Promise<{ objectKeys: string[]; nextContinuationToken?: string }>
      >()
      .mockResolvedValueOnce({
        objectKeys: ['incoming/ses-a'],
        nextContinuationToken: 'next',
      })
      .mockResolvedValueOnce({ objectKeys: ['incoming/ses-b'] })
    type ReconcileDependencies = NonNullable<Parameters<typeof reconcileSesInboundEmails>[0]>
    const enqueueOrRetry =
      vi.fn<NonNullable<ReconcileDependencies['enqueueOrRetryBulkSesInboundProcess']>>()
    enqueueOrRetry.mockResolvedValue(0)

    await expect(
      reconcileSesInboundEmails({
        listSesInboundObjects: listObjects,
        enqueueOrRetryBulkSesInboundProcess: enqueueOrRetry,
        listInboundCustomerSupportRecoveryCandidates: async () => ({
          results: [],
          page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
        }),
      }),
    ).resolves.toEqual({ enqueued: 2, customerSupportEnqueued: 0 })
    expect(listObjects).toHaveBeenNthCalledWith(1, undefined)
    expect(listObjects).toHaveBeenNthCalledWith(2, 'next')
    expect(enqueueOrRetry).toHaveBeenNthCalledWith(1, [
      { sesMessageId: 'ses-a', objectKey: 'incoming/ses-a' },
    ])
    expect(enqueueOrRetry).toHaveBeenNthCalledWith(2, [
      { sesMessageId: 'ses-b', objectKey: 'incoming/ses-b' },
    ])
  })

  it('recovers a DB-only support-agent job when the S3 object is already deleted', async () => {
    const candidate = {
      threadId: 'thread-db-only',
      supportMessageId: 'message-db-only',
      logicalJobId: 'support_inbound_email__message-db-only__customer_support',
    }
    const enqueueCustomerSupport = vi.fn<() => Promise<number>>().mockResolvedValue(0)

    await expect(
      reconcileSesInboundEmails({
        listSesInboundObjects: async () => ({ objectKeys: [] }),
        listInboundCustomerSupportRecoveryCandidates: async () => ({
          results: [candidate],
          page_info: { has_next_page: false, start_cursor: 'start', end_cursor: null },
        }),
        enqueueOrRetryBulkCustomerSupport: enqueueCustomerSupport,
      }),
    ).resolves.toEqual({ enqueued: 0, customerSupportEnqueued: 1 })

    expect(enqueueCustomerSupport).toHaveBeenCalledWith([
      {
        threadId: candidate.threadId,
        supportMessageId: candidate.supportMessageId,
        logicalJobId: candidate.logicalJobId,
      },
    ])
  })

  it('advances the PostgreSQL cursor only after each page fan-out is awaited', async () => {
    const first = {
      threadId: 'thread-first',
      supportMessageId: 'message-first',
      logicalJobId: 'support_inbound_email__message-first__customer_support',
    }
    const second = {
      threadId: 'thread-second',
      supportMessageId: 'message-second',
      logicalJobId: 'support_inbound_email__message-second__customer_support',
    }
    const events: string[] = []
    let releaseFirstEnqueue!: () => void
    const firstEnqueueGate = new Promise<void>(resolve => {
      releaseFirstEnqueue = resolve
    })
    type ReconcileDependencies = NonNullable<Parameters<typeof reconcileSesInboundEmails>[0]>
    const listCandidates = vi
      .fn<NonNullable<ReconcileDependencies['listInboundCustomerSupportRecoveryCandidates']>>()
      .mockImplementationOnce(async () => {
        events.push('list:first')
        return {
          results: [first],
          page_info: { has_next_page: true, start_cursor: 'start', end_cursor: 'opaque-page-1' },
        }
      })
      .mockImplementationOnce(async () => {
        events.push('list:second')
        return {
          results: [second],
          page_info: { has_next_page: false, start_cursor: 'start', end_cursor: null },
        }
      })
    const enqueueCustomerSupport = vi
      .fn<NonNullable<ReconcileDependencies['enqueueOrRetryBulkCustomerSupport']>>()
      .mockImplementationOnce(async () => {
        events.push('enqueue:first')
        await firstEnqueueGate
        return 0
      })
      .mockImplementationOnce(async () => {
        events.push('enqueue:second')
        return 0
      })

    const reconciliation = reconcileSesInboundEmails({
      listSesInboundObjects: async () => ({ objectKeys: [] }),
      enqueueOrRetryBulkSesInboundProcess: async () => 0,
      listInboundCustomerSupportRecoveryCandidates: listCandidates,
      enqueueOrRetryBulkCustomerSupport: enqueueCustomerSupport,
    })
    await vi.waitFor(() => expect(enqueueCustomerSupport).toHaveBeenCalledTimes(1))
    expect(listCandidates).toHaveBeenCalledTimes(1)
    releaseFirstEnqueue()

    await expect(reconciliation).resolves.toEqual({ enqueued: 0, customerSupportEnqueued: 2 })
    expect(listCandidates).toHaveBeenNthCalledWith(1, {})
    expect(listCandidates).toHaveBeenNthCalledWith(2, { after: 'opaque-page-1' })
    expect(enqueueCustomerSupport).toHaveBeenNthCalledWith(1, [first])
    expect(enqueueCustomerSupport).toHaveBeenNthCalledWith(2, [second])
    expect(events).toEqual(['list:first', 'enqueue:first', 'list:second', 'enqueue:second'])
  })
})
