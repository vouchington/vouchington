import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB,
  OAUTH_AUTHORIZATION_EXCHANGE_JOB,
} from '@queues/background/enqueues/oauth-authorization-exchange-jobs'
import { OAUTH_AUTHORIZATION_EXCHANGE_ORDERING } from '@queues/oauth-authorization-exchange/config'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('oauth-authorization-exchange group through real GlideMQ', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  it('serializes dispatcher passes across workers while exchanges run uncapped', async () => {
    let exchangesStarted = 0
    let dispatchActive = 0
    let dispatchMaxActive = 0
    const dispatchStarted: string[] = []
    const threeExchangesActive = Promise.withResolvers<void>()
    const firstDispatchStarted = Promise.withResolvers<void>()
    const laterExchangeRan = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      workers: 2,
      concurrency: 3,
      bodies: {
        [OAUTH_AUTHORIZATION_EXCHANGE_JOB.name]: async () => {
          exchangesStarted += 1
          if (exchangesStarted > 3) return laterExchangeRan.resolve()
          if (exchangesStarted === 3) threeExchangesActive.resolve()
          await release.promise
        },
        [OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB.name]: async job => {
          dispatchStarted.push(job.id)
          dispatchActive += 1
          dispatchMaxActive = Math.max(dispatchMaxActive, dispatchActive)
          firstDispatchStarted.resolve()
          await release.promise
          dispatchActive -= 1
        },
      },
    })
    try {
      const exchanges = await Promise.all(
        Array.from({ length: 3 }, () =>
          harness!.add(OAUTH_AUTHORIZATION_EXCHANGE_JOB, { authorizationId: randomUUID() }),
        ),
      )
      // No domain-wide cap: three exchanges are in flight at once.
      await threeExchangesActive.promise
      const dispatchers = await Promise.all(
        Array.from({ length: 3 }, () =>
          harness!.add(
            OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB,
            {},
            { ordering: OAUTH_AUTHORIZATION_EXCHANGE_ORDERING.dispatcher },
          ),
        ),
      )
      await firstDispatchStarted.promise
      const later = await harness.add(OAUTH_AUTHORIZATION_EXCHANGE_JOB, {
        authorizationId: randomUUID(),
      })

      // A free worker slot ran another exchange while the other dispatcher passes stayed parked.
      await laterExchangeRan.promise
      expect(dispatchStarted).toHaveLength(1)
      expect(dispatchMaxActive).toBe(1)

      release.resolve()
      await Promise.all([...exchanges, ...dispatchers, later].map(job => harness!.settled(job)))
      expect(dispatchStarted).toHaveLength(dispatchers.length)
      expect(dispatchMaxActive).toBe(1)
    } finally {
      release.resolve()
    }
  })
})
