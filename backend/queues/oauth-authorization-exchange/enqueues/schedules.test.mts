import { SCHEDULING_FLOOR_MS } from '@vouchington/worker-runtime/schedule-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { describe, expect, it } from 'vitest'
import { scheduledJobManifest } from './schedules.mts'

describe('OAuth authorization exchange schedules', () => {
  it('schedules the durable recovery dispatcher on the background queue at the 1-minute floor', () => {
    expect(scheduledJobManifest.queueName).toBe(BACKGROUND_QUEUE_NAME)
    expect(scheduledJobManifest.jobs).toHaveLength(1)
    expect(scheduledJobManifest.jobs[0]).toMatchObject({
      schedulerId: 'oauthAuthorizationExchangeDispatcher',
      repeat: { every: SCHEDULING_FLOOR_MS },
      template: {
        name: 'oauth-authorization-exchange.dispatchOAuthAuthorizationExchanges',
        opts: {
          priority: 100,
          ordering: { key: 'oauth-authorization-exchange:dispatcher', concurrency: 1 },
        },
      },
    })
  })
})
