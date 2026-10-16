import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { ENTITY_LISTENERS_URL_CREATED_JOB } from '@queues/background/enqueues/entity-listeners-jobs'
import { POST_MENTIONS_PROCESS_JOB } from '@queues/background/enqueues/post-mentions-jobs'
import {
  VOTE_AGGREGATION_REFRESH_POST_METRICS_JOB,
  VOTE_AGGREGATION_UPDATE_ELECTION_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import type { BackgroundJobDefinition } from '@queues/background/types'
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
})
