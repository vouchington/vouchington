import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { OPENAI_MODERATION_POST_JOB } from '@queues/background/enqueues/openai-moderation-jobs'
import { SES_INBOUND_PROCESS_JOB } from '@queues/background/enqueues/ses-inbound-jobs'
import { BACKGROUND_CPU_DOMAINS, BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { createTestUser } from '@voucha/test-helpers'
import { countDomainJobs } from './domain-stats.mts'
import { listManagedQueueDomains, setManagedQueueDomainPaused } from './domains.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
const FAR_FUTURE_DELAY_MS = 3_600_000
// Jobs outside their domain group, so every state is plain waiting, active, delayed, done or failed.
const UNGROUPED = { ordering: undefined, attempts: 1 }

type SesBody = { hold?: boolean; fail?: boolean }

function sesData(body: SesBody = {}) {
  const sesMessageId = `ses-${randomUUID()}`
  return { sesMessageId, objectKey: `copyright-incoming/${sesMessageId}`, ...body }
}

describe('capped per-domain job counts through real GlideMQ', () => {
  let harness: BackgroundHarness | undefined

  afterEach(async () => {
    await harness?.close()
    harness = undefined
  })

  it('routes CPU domain stats and rejects an unknown domain before changing controls', async () => {
    const { domains } = await listManagedQueueDomains(BACKGROUND_CPU_QUEUE_NAME)
    expect(domains.map(domain => domain.domain)).toEqual(BACKGROUND_CPU_DOMAINS)
    expect(domains.every(domain => domain.waiting.count >= 0 && domain.delayed.count >= 0)).toBe(
      true,
    )

    const admin = await createTestUser({ administrator: true })
    await expect(
      setManagedQueueDomainPaused(admin, BACKGROUND_CPU_QUEUE_NAME, 'unknown', { paused: true }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('counts each state exactly under the cap, never counts another domain, and stops at the cap', async () => {
    const holding = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    harness = await startBackgroundHarness({
      connection,
      // The shared worker package is out of reach here, so a plain processor stands in for it.
      createProcessor: () => async (job: Job<SesBody>) => {
        if (job.data.fail) throw new Error('expected failure')
        if (job.data.hold) {
          holding.resolve()
          await release.promise
        }
      },
    })
    harness.registerBeforeClose(() => release.resolve())
    try {
      const done = await Promise.all([
        harness.add(SES_INBOUND_PROCESS_JOB, sesData(), UNGROUPED),
        harness.add(SES_INBOUND_PROCESS_JOB, sesData(), UNGROUPED),
      ])
      await Promise.all(done.map(job => harness!.settled(job)))
      const failed = await harness.add(SES_INBOUND_PROCESS_JOB, sesData({ fail: true }), UNGROUPED)
      await expect(harness.settled(failed)).resolves.toBe('failed')
      await harness.add(SES_INBOUND_PROCESS_JOB, sesData({ hold: true }), UNGROUPED)
      await holding.promise
      for (let index = 0; index < 3; index += 1) {
        await harness.add(SES_INBOUND_PROCESS_JOB, sesData(), {
          ...UNGROUPED,
          delay: FAR_FUTURE_DELAY_MS,
        })
      }
      await harness.add(
        OPENAI_MODERATION_POST_JOB,
        { id: randomUUID() },
        {
          ...UNGROUPED,
          delay: FAR_FUTURE_DELAY_MS,
        },
      )

      const exact = await countDomainJobs(harness.queue, [SES_INBOUND_PROCESS_JOB.name], 100)
      expect(exact).toEqual({
        waiting: { count: 0, complete: true },
        active: { count: 1, complete: true },
        delayed: { count: 3, complete: true },
        completed: { count: 2, complete: true },
        failed: { count: 1, complete: true },
      })

      // A cap below a state's size stops the scan there; smaller states stay exact.
      const capped = await countDomainJobs(harness.queue, [SES_INBOUND_PROCESS_JOB.name], 2)
      expect(capped.delayed).toEqual({ count: 2, complete: false })
      expect(capped.completed).toEqual({ count: 2, complete: false })
      expect(capped.failed).toEqual({ count: 1, complete: true })
      expect(capped.active).toEqual({ count: 1, complete: true })

      // Another domain's backlog can fill the shared read: this domain's job lies beyond it, so
      // its count is partial rather than exact.
      const crowdedOut = await countDomainJobs(harness.queue, [OPENAI_MODERATION_POST_JOB.name], 2)
      expect(crowdedOut.delayed).toEqual({ count: 0, complete: false })

      // The other domain sees only its own job, though the queue holds both.
      const other = await countDomainJobs(harness.queue, [OPENAI_MODERATION_POST_JOB.name], 100)
      expect(other.delayed).toEqual({ count: 1, complete: true })
      expect(other.completed).toEqual({ count: 0, complete: true })
    } finally {
      release.resolve()
    }
  })
})
