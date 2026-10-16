import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { throwRateLimited } from '@modules/queue-errors'
import { ENTITY_LISTENERS_URL_CREATED_JOB } from '@queues/background/enqueues/entity-listeners-jobs'
import { POST_MENTIONS_PROCESS_JOB } from '@queues/background/enqueues/post-mentions-jobs'
import {
  VOTE_AGGREGATION_REFRESH_POST_METRICS_JOB,
  VOTE_AGGREGATION_UPDATE_ELECTION_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import type { BackgroundJobDefinition } from '@queues/background/types'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { measureDomainCap } from '@voucha/test-helpers/real-glide-domain-cap'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

function measure(jobs: readonly BackgroundJobDefinition[], cap: number): Promise<number> {
  return measureDomainCap({ jobs, cap, connection, createProcessor: createBackgroundProcessor })
}

describe('content and vote domains keep their old worker caps on the shared queue', () => {
  it('runs at most five post-mentions jobs at once', async () => {
    await expect(measure([POST_MENTIONS_PROCESS_JOB], 5)).resolves.toBe(5)
  })

  it('runs at most five entity-listeners jobs at once', async () => {
    await expect(measure([ENTITY_LISTENERS_URL_CREATED_JOB], 5)).resolves.toBe(5)
  })

  it('runs at most ten vote-aggregation jobs of any name at once', async () => {
    await expect(
      measure(
        [VOTE_AGGREGATION_UPDATE_ELECTION_JOB, VOTE_AGGREGATION_REFRESH_POST_METRICS_JOB],
        10,
      ),
    ).resolves.toBe(10)
  })

  describe('a provider rate-limit signal', () => {
    let harness: BackgroundHarness | undefined

    afterEach(async () => {
      await harness?.close()
      harness = undefined
    })

    it('delays only the signalling job of a job-scoped domain group', async () => {
      let calls = 0
      harness = await startBackgroundHarness({
        connection,
        createProcessor: createBackgroundProcessor,
        bodies: {
          [POST_MENTIONS_PROCESS_JOB.name]: () => {
            calls += 1
            if (calls === 1) throwRateLimited(60_000)
          },
        },
      })
      const limited = await harness.add(POST_MENTIONS_PROCESS_JOB, { postId: randomUUID() })
      await harness.activated(limited, 1)
      const sibling = await harness.add(POST_MENTIONS_PROCESS_JOB, { postId: randomUUID() })

      // A sibling of the same domain runs while the limited job waits out its delay, because the
      // deferral did not park the domain group.
      await expect(harness.settled(sibling)).resolves.toBe('completed')
      const waiting = await harness.queue.getJob(limited.id)
      expect(await waiting?.getState()).toBe('delayed')
      expect(waiting?.attemptsMade).toBe(0)
    })
  })
})
