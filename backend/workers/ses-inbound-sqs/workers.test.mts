import { once } from 'node:events'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  countTestSqsMessages,
  sendTestSqsMessage,
  useTestSqsQueue,
} from '@voucha/test-helpers/aws-emulator-sqs'
import { sentryCaptureMessageMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { loadSesInboundSqs } from './workers.mts'

describe('loadSesInboundSqs', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns null and reports the gap when SES_INBOUND_SQS_QUEUE_URL is unset', async () => {
    vi.stubEnv('SES_INBOUND_SQS_QUEUE_URL', undefined)

    const consumer = await loadSesInboundSqs()

    expect(consumer).toBeNull()
    expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith(
      'sqs_consumer_config_missing',
      {
        level: 'warning',
        tags: {
          reason: 'sqs_consumer_config_missing',
          queueName: 'ses-inbound-sqs',
          missingEnvVar: 'SES_INBOUND_SQS_QUEUE_URL',
        },
      },
    )
  })

  it('consumes the S3 test event from the configured queue and acknowledges it', async () => {
    const queueUrl = await useTestSqsQueue('SES_INBOUND_SQS_QUEUE_URL', 'ses-inbound-sqs')
    await sendTestSqsMessage(
      queueUrl,
      JSON.stringify({ Service: 'Amazon S3', Event: 's3:TestEvent' }),
    )

    const consumer = await loadSesInboundSqs()
    if (!consumer) throw new Error('The consumer did not load')
    // close() returns one shared promise, so closing again after a failed assertion is safe.
    onTestFinished(() => consumer.close())
    expect(consumer.name).toBe('ses-inbound-sqs')
    await once(consumer, 'message-deleted')

    expect(await countTestSqsMessages(queueUrl)).toBe(0)
  })
})
