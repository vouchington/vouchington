import { once } from 'node:events'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  countTestSqsMessages,
  sendTestSqsMessage,
  useTestSqsQueue,
} from '@voucha/test-helpers/aws-emulator-sqs'
import { sentryCaptureMessageMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { loadStripeEventsSqs } from './workers.mts'

describe('loadStripeEventsSqs', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns null and reports the gap when STRIPE_EVENTS_SQS_QUEUE_URL is unset', async () => {
    vi.stubEnv('STRIPE_EVENTS_SQS_QUEUE_URL', undefined)

    const consumer = await loadStripeEventsSqs()

    expect(consumer).toBeNull()
    expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith(
      'sqs_consumer_config_missing',
      {
        level: 'warning',
        tags: {
          reason: 'sqs_consumer_config_missing',
          queueName: 'stripe-events-sqs',
          missingEnvVar: 'STRIPE_EVENTS_SQS_QUEUE_URL',
        },
      },
    )
  })

  it('reads the configured queue and leaves a malformed event for redelivery', async () => {
    const queueUrl = await useTestSqsQueue('STRIPE_EVENTS_SQS_QUEUE_URL', 'stripe-events-sqs')
    await sendTestSqsMessage(queueUrl, '{}')

    const consumer = await loadStripeEventsSqs()
    if (!consumer) throw new Error('The consumer did not load')
    // close() returns one shared promise, so closing again after a failed assertion is safe.
    onTestFinished(() => consumer.close())
    expect(consumer.name).toBe('stripe-events-sqs')
    await once(consumer, 'message-failed')

    expect(await countTestSqsMessages(queueUrl)).toBe(1)
  })
})
