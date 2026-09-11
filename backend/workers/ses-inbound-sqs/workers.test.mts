import { afterEach, describe, expect, it, vi } from 'vitest'
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
})
