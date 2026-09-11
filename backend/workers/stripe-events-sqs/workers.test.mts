import { afterEach, describe, expect, it, vi } from 'vitest'
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
})
