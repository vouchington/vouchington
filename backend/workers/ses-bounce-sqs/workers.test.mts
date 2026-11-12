import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  countTestSqsMessages,
  sendTestSqsMessage,
  useTestSqsQueue,
} from '@voucha/test-helpers/aws-emulator-sqs'
import { sentryCaptureMessageMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { loadSesBounceSqs } from './workers.mts'

describe('loadSesBounceSqs', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns null and reports the gap when SES_BOUNCE_SQS_QUEUE_URL is unset', async () => {
    vi.stubEnv('SES_BOUNCE_SQS_QUEUE_URL', undefined)

    const consumer = await loadSesBounceSqs()

    expect(consumer).toBeNull()
    expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith(
      'sqs_consumer_config_missing',
      {
        level: 'warning',
        tags: {
          reason: 'sqs_consumer_config_missing',
          queueName: 'ses-bounce-sqs',
          missingEnvVar: 'SES_BOUNCE_SQS_QUEUE_URL',
        },
      },
    )
  })

  it('consumes a message from the configured queue and acknowledges it', async () => {
    const queueUrl = await useTestSqsQueue('SES_BOUNCE_SQS_QUEUE_URL', 'ses-bounce-sqs')
    await sendTestSqsMessage(queueUrl, JSON.stringify({ eventType: 'Delivery', delivery: {} }))

    const consumer = await loadSesBounceSqs()
    expect(consumer?.name).toBe('ses-bounce-sqs')
    await once(consumer!, 'message-deleted')
    await consumer!.close()

    expect(await countTestSqsMessages(queueUrl)).toBe(0)
  })
})
