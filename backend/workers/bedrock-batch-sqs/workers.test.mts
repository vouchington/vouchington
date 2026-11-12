import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  countTestSqsMessages,
  sendTestSqsMessage,
  useTestSqsQueue,
} from '@voucha/test-helpers/aws-emulator-sqs'
import { sentryCaptureMessageMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { loadBedrockBatchSqs } from './workers.mts'

describe('loadBedrockBatchSqs', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns null and reports the gap when BEDROCK_BATCH_SQS_QUEUE_URL is unset', async () => {
    vi.stubEnv('BEDROCK_BATCH_SQS_QUEUE_URL', undefined)

    const consumer = await loadBedrockBatchSqs()

    expect(consumer).toBeNull()
    expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith(
      'sqs_consumer_config_missing',
      {
        level: 'warning',
        tags: {
          reason: 'sqs_consumer_config_missing',
          queueName: 'bedrock-batch-sqs',
          missingEnvVar: 'BEDROCK_BATCH_SQS_QUEUE_URL',
        },
      },
    )
  })

  it('reads the configured queue and leaves an event without a job ARN for redelivery', async () => {
    const queueUrl = await useTestSqsQueue('BEDROCK_BATCH_SQS_QUEUE_URL', 'bedrock-batch-sqs')
    await sendTestSqsMessage(queueUrl, JSON.stringify({ detail: {} }))

    const consumer = await loadBedrockBatchSqs()
    expect(consumer?.name).toBe('bedrock-batch-sqs')
    await once(consumer!, 'message-failed')
    await consumer!.close()

    expect(await countTestSqsMessages(queueUrl)).toBe(1)
  })
})
