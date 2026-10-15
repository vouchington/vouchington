import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { createTestUser } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import { createBackgroundProcessor } from '../processors.mts'
import { OPENAI_MODERATION_POST_JOB } from '@queues/background/enqueues/openai-moderation-jobs'
import { SES_INBOUND_PROCESS_JOB } from '@queues/background/enqueues/ses-inbound-jobs'
import { backgroundQueueConfig } from '@queues/background/config'
import { pauseQueueDomain, resumeQueueDomain } from '@services/queue-domain-controls'
import { invalidateQueueDomainPause } from '@services/queue-domain-controls/pause-cache'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
const PAUSED_DOMAIN = 'openai-moderation'

describe('domain pause through real GlideMQ and PostgreSQL', () => {
  let userId: string
  let restoreConfig: () => void
  let harness: BackgroundHarness | undefined

  beforeAll(async () => {
    userId = (await createTestUser()).id
    // The smallest fixture: re-read the pause state at once and recheck a parked job every 50ms.
    restoreConfig = overrideDynamicConfigFieldsForTest(backgroundQueueConfig, {
      pause_cache_ms: 1,
      pause_recheck_ms: 50,
    })
  })

  afterEach(async () => {
    await resumeQueueDomain(PAUSED_DOMAIN)
    invalidateQueueDomainPause(PAUSED_DOMAIN)
    await harness?.close()
    harness = undefined
  })

  afterAll(() => restoreConfig())

  it.each([
    ['a job in its domain-wide group', {}],
    ['a job with no group', { ordering: undefined }],
  ])(
    'defers %s without spending an attempt while another domain keeps running, then runs it on resume',
    async (_name, groupOptions) => {
      const moderationRan = Promise.withResolvers<void>()
      harness = await startBackgroundHarness({
        connection,
        createProcessor: createBackgroundProcessor,
        bodies: { [OPENAI_MODERATION_POST_JOB.name]: () => moderationRan.resolve() },
      })
      await pauseQueueDomain(PAUSED_DOMAIN, { userId, reason: 'test pause' })
      invalidateQueueDomainPause(PAUSED_DOMAIN)
      const parked = await harness.add(
        OPENAI_MODERATION_POST_JOB,
        { id: randomUUID() },
        { attempts: 3, ...groupOptions },
      )
      const other = await harness.add(SES_INBOUND_PROCESS_JOB, {
        sesMessageId: 'ses-pause',
        objectKey: 'copyright-incoming/ses-pause',
      })

      // Another domain on the same worker keeps running, and the paused job was started and parked
      // more than once, re-checking its domain each time.
      await expect(harness.settled(other)).resolves.toBe('completed')
      await harness.activated(parked, 2)
      const waiting = await harness.queue.getJob(parked.id)
      expect(waiting?.attemptsMade).toBe(0)
      expect(await Promise.race([moderationRan.promise, Promise.resolve('not run')])).toBe(
        'not run',
      )

      await resumeQueueDomain(PAUSED_DOMAIN)
      await moderationRan.promise
      await expect(harness.settled(parked)).resolves.toBe('completed')
      expect((await harness.queue.getJob(parked.id))?.attemptsMade).toBe(0)
    },
  )
})
