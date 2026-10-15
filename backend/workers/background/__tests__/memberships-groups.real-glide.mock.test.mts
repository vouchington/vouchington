import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { entityOrderingKey } from '@queues/background/enqueues/define-job'
import { MEMBERSHIPS_STRIPE_EVENT_JOB } from '@queues/background/enqueues/memberships-jobs'
import type { ProcessStripeEventData } from '@queues/background/enqueues/memberships-domain'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

function stripeEvent(subscriptionId: string): ProcessStripeEventData {
  return {
    stripeEventRecordId: randomUUID(),
    leaseToken: randomUUID(),
    stripeSubscriptionId: subscriptionId,
    isLiveMode: false,
  }
}

function subscriptionOrdering(subscriptionId: string) {
  return {
    ordering: {
      key: entityOrderingKey('memberships', `stripe-subscription:test:${subscriptionId}`),
      concurrency: 1,
    },
  }
}

describe('memberships entity ordering through real GlideMQ', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  it('serializes events of one subscription across workers while another subscription runs beside it', async () => {
    const first = stripeEvent(`sub_${randomUUID()}`)
    const second = { ...stripeEvent(first.stripeSubscriptionId!) }
    const other = stripeEvent(`sub_${randomUUID()}`)
    const started: string[] = []
    let firstFinished = false
    let secondSawFirstFinished: boolean | undefined
    const firstStarted = Promise.withResolvers<void>()
    const otherStarted = Promise.withResolvers<void>()
    const releaseFirst = Promise.withResolvers<void>()
    const body = async (job: Job<ProcessStripeEventData>): Promise<void> => {
      started.push(job.data.stripeEventRecordId)
      if (job.data.stripeEventRecordId === first.stripeEventRecordId) {
        firstStarted.resolve()
        await releaseFirst.promise
        firstFinished = true
      } else if (job.data.stripeEventRecordId === other.stripeEventRecordId) {
        otherStarted.resolve()
      } else {
        secondSawFirstFinished = firstFinished
      }
    }
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      workers: 2,
      concurrency: 2,
      bodies: { [MEMBERSHIPS_STRIPE_EVENT_JOB.name]: body as (job: Job) => unknown },
    })
    try {
      const firstJob = await harness.add(
        MEMBERSHIPS_STRIPE_EVENT_JOB,
        first,
        subscriptionOrdering(first.stripeSubscriptionId!),
      )
      await firstStarted.promise
      const secondJob = await harness.add(
        MEMBERSHIPS_STRIPE_EVENT_JOB,
        second,
        subscriptionOrdering(second.stripeSubscriptionId!),
      )
      const otherJob = await harness.add(
        MEMBERSHIPS_STRIPE_EVENT_JOB,
        other,
        subscriptionOrdering(other.stripeSubscriptionId!),
      )

      // The other subscription runs while the first holds its key, and the second waits for it.
      await otherStarted.promise
      expect(started).toEqual([first.stripeEventRecordId, other.stripeEventRecordId])

      releaseFirst.resolve()
      await Promise.all([firstJob, secondJob, otherJob].map(job => harness!.settled(job)))
      expect(secondSawFirstFinished).toBe(true)
    } finally {
      releaseFirst.resolve()
    }
  })
})
