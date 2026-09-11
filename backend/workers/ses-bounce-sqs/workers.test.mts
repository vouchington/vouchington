import { afterEach, describe, expect, it, vi } from 'vitest'
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
})
