import { DeleteMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockSend: vi.fn<VitestLooseMock>(),
}))

vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => ({
  ...(await importOriginal<typeof import('@modules/aws')>()),
  SQSClient: { send: mocks.mockSend } as unknown as typeof import('@modules/aws').SQSClient,
}))

import { createSqsConsumer, type SqsConsumerHandler } from './sqs-consumer.mts'

const QUEUE_URL = 'https://sqs.us-west-2.amazonaws.com/123456789012/bedrock-batch-sqs'

// Mirrors createOneShotPort in sqs-consumer.test.mts: once any queued mockImplementationOnce
// response is exhausted, every further receive() call must hang until the AbortSignal fires
// (real long-polling behavior) -- resolving immediately here would tight-loop the consumer's
// while(!aborted) poll and starve the event loop before a test can assert or close().
function hangUntilAborted(command: unknown, options?: { abortSignal?: AbortSignal }) {
  if (command instanceof ReceiveMessageCommand) {
    return new Promise((_resolve, reject) => {
      options?.abortSignal?.addEventListener('abort', () => reject(new Error('AbortError')), {
        once: true,
      })
    })
  }
  return Promise.resolve({})
}

describe('createSqsConsumer against the real SQSClient port', () => {
  beforeEach(() => {
    mocks.mockSend.mockReset()
    mocks.mockSend.mockImplementation(hangUntilAborted)
  })

  it('receives a message via ReceiveMessageCommand and deletes it via DeleteMessageCommand', async () => {
    mocks.mockSend.mockResolvedValueOnce({
      Messages: [
        {
          MessageId: 'm1',
          ReceiptHandle: 'rh1',
          Body: '{"jobArn":"arn:1"}',
        },
      ],
    })
    const handleMessage = vi.fn<SqsConsumerHandler>(() => Promise.resolve())

    const consumer = createSqsConsumer({ name: 'test', queueUrl: QUEUE_URL, handleMessage })
    const deleted = new Promise(resolve => consumer.once('message-deleted', resolve))
    await deleted
    await consumer.close()

    expect(handleMessage).toHaveBeenCalledExactlyOnceWith({
      messageId: 'm1',
      receiptHandle: 'rh1',
      body: '{"jobArn":"arn:1"}',
    })

    const receiveCall = mocks.mockSend.mock.calls[0]!
    const receiveCommand = receiveCall[0] as ReceiveMessageCommand
    expect(receiveCommand).toBeInstanceOf(ReceiveMessageCommand)
    expect(receiveCommand.input).toEqual({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,
    })
    expect(receiveCall[1]).toMatchObject({ abortSignal: expect.any(AbortSignal) })

    const deleteCall = mocks.mockSend.mock.calls[1]!
    const deleteCommand = deleteCall[0] as DeleteMessageCommand
    expect(deleteCommand).toBeInstanceOf(DeleteMessageCommand)
    expect(deleteCommand.input).toEqual({ QueueUrl: QUEUE_URL, ReceiptHandle: 'rh1' })
  })

  it('filters out malformed messages missing required fields before they reach the handler', async () => {
    mocks.mockSend.mockResolvedValueOnce({
      Messages: [
        {
          ReceiptHandle: 'rh1',
          Body: 'x',
        },
        {
          MessageId: 'm2',
          Body: 'x',
        },
        {
          MessageId: 'm3',
          ReceiptHandle: 'rh3',
        },
      ],
    })
    const handleMessage = vi.fn<SqsConsumerHandler>(() => Promise.resolve())

    const consumer = createSqsConsumer({ name: 'test', queueUrl: QUEUE_URL, handleMessage })
    // The second (hanging) receive() call only fires once the first batch finished processing --
    // proof every message in it was filtered out rather than handed to the handler.
    await vi.waitFor(() => expect(mocks.mockSend).toHaveBeenCalledTimes(2))
    await consumer.close()

    expect(handleMessage).not.toHaveBeenCalled()
  })

  it('treats a batch with no Messages key as empty and keeps polling', async () => {
    mocks.mockSend.mockResolvedValueOnce({})
    const handleMessage = vi.fn<SqsConsumerHandler>(() => Promise.resolve())

    const consumer = createSqsConsumer({ name: 'test', queueUrl: QUEUE_URL, handleMessage })
    await vi.waitFor(() => expect(mocks.mockSend).toHaveBeenCalledTimes(2))
    await consumer.close()

    expect(handleMessage).not.toHaveBeenCalled()
  })
})
