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
import { measureDomainCap } from '@voucha/test-helpers/real-glide-domain-cap'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('oauth-authorization-exchange through real GlideMQ', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  it('runs at most four exchanges at once while another domain runs beside them', async () => {
    await expect(
      measureDomainCap({
        jobs: [OAUTH_AUTHORIZATION_EXCHANGE_JOB],
        cap: 4,
        connection,
        createProcessor: createBackgroundProcessor,
      }),
    ).resolves.toBe(4)
  })

  it('serializes dispatcher passes across workers beside a full set of exchanges', async () => {
    let exchangesActive = 0
    let dispatchActive = 0
    let dispatchMaxActive = 0
    const dispatchStarted: string[] = []
    const fourExchangesActive = Promise.withResolvers<void>()
    const firstDispatchStarted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      workers: 2,
      concurrency: 4,
      workerOptions: { blockTimeout: 100 },
      bodies: {
        [OAUTH_AUTHORIZATION_EXCHANGE_JOB.name]: async () => {
          exchangesActive += 1
          if (exchangesActive === 4) fourExchangesActive.resolve()
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
      const exchanges = []
      for (let index = 0; index < 4; index += 1) {
        const job = await harness.add(OAUTH_AUTHORIZATION_EXCHANGE_JOB, {
          authorizationId: randomUUID(),
        })
        await harness.activated(job, 1)
        exchanges.push(job)
      }
      await fourExchangesActive.promise
      // The dispatcher's own singleton key puts it outside the exchange group, so it still starts.
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
      expect(dispatchStarted).toHaveLength(1)
      expect(dispatchMaxActive).toBe(1)

      release.resolve()
      await Promise.all([...exchanges, ...dispatchers].map(job => harness!.settled(job)))
      expect(dispatchStarted).toHaveLength(dispatchers.length)
      expect(dispatchMaxActive).toBe(1)
    } finally {
      release.resolve()
    }
  })
})
