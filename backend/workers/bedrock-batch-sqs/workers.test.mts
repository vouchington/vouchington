import { afterEach, describe, expect, it, vi } from 'vitest'
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
})
