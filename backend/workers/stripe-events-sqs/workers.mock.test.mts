import { ReceiveMessageCommand } from '@aws-sdk/client-sqs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockSend: vi.fn<VitestLooseMock>(),
}))

vi.mock<typeof import('@modules/aws')>(import('@modules/aws'), async importOriginal => ({
  ...(await importOriginal<typeof import('@modules/aws')>()),
  SQSClient: { send: mocks.mockSend } as unknown as typeof import('@modules/aws').SQSClient,
}))

import { loadStripeEventsSqs } from './workers.mts'

describe('loadStripeEventsSqs success path', () => {
  beforeEach(() => {
    mocks.mockSend.mockReset()
    // Mirrors sqs-consumer.no-data.mock.test.mts: no message batch is queued, so the
    // constructor's first (and only) long poll must hang until close() aborts it -- resolving
    // immediately here would tight-loop the consumer before the test can assert and close().
    mocks.mockSend.mockImplementation(
      (command: unknown, options?: { abortSignal?: AbortSignal }) => {
        if (command instanceof ReceiveMessageCommand) {
          return new Promise((_resolve, reject) => {
            options?.abortSignal?.addEventListener('abort', () => reject(new Error('AbortError')), {
              once: true,
            })
          })
        }
        return Promise.resolve({})
      },
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns a running consumer for the configured queue', async () => {
    vi.stubEnv(
      'STRIPE_EVENTS_SQS_QUEUE_URL',
      'https://sqs.us-west-2.amazonaws.com/123456789012/stripe-events-sqs',
    )

    const consumer = await loadStripeEventsSqs()

    expect(consumer).not.toBeNull()
    expect(consumer!.name).toBe('stripe-events-sqs')
    await consumer!.close()

    expect(mocks.mockSend).toHaveBeenCalledOnce()
    const receiveCommand = mocks.mockSend.mock.calls[0]![0] as ReceiveMessageCommand
    expect(receiveCommand).toBeInstanceOf(ReceiveMessageCommand)
    expect(receiveCommand.input.QueueUrl).toBe(
      'https://sqs.us-west-2.amazonaws.com/123456789012/stripe-events-sqs',
    )
  })
})
