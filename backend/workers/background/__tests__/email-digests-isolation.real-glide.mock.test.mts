import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { ENQUEUE_BASE_DEFAULTS } from '@data-stores/valkey-glide-mq'
import { EMAIL_DIGESTS_SEND_FOLLOW_TOPICS_JOB } from '@queues/background/enqueues/email-digests-jobs'
import {
  startBackgroundHarness,
  type BackgroundHarness,
} from '@voucha/test-helpers/real-glide-background'
import {
  startRealGlideJobLifecycle,
  type RealGlideJobLifecycle,
} from '@voucha/test-helpers/real-glide-job-lifecycle'
import { createBackgroundProcessor } from '../processors.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
const DIGEST_SENDS = 12

describe('transactional emails beside a flooded email-digests domain through real GlideMQ', () => {
  let harness: BackgroundHarness | undefined
  let transactional: RealGlideJobLifecycle<Record<string, unknown>> | undefined

  afterEach(async () => {
    await harness?.close()
    await transactional?.close()
    harness = undefined
    transactional = undefined
  })

  it('completes a login token while the digest sends are still waiting for the worker', async () => {
    const started: string[] = []
    const firstStarted = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    harness = await startBackgroundHarness({
      connection,
      createProcessor: createBackgroundProcessor,
      bodies: {
        [EMAIL_DIGESTS_SEND_FOLLOW_TOPICS_JOB.name]: async job => {
          started.push(job.id)
          firstStarted.resolve()
          await release.promise
        },
      },
    })
    harness.registerBeforeClose(() => release.resolve())
    transactional = await startRealGlideJobLifecycle('emails_login', connection)
    try {
      const digests = await Promise.all(
        Array.from({ length: DIGEST_SENDS }, () =>
          harness!.add(EMAIL_DIGESTS_SEND_FOLLOW_TOPICS_JOB, {
            input: { userId: randomUUID() },
            variables: {},
          }),
        ),
      )
      await firstStarted.promise

      const login = await transactional.queue.add(
        'processSendEmailAddressLoginToken',
        { input: { emailAddress: 'tests@voucha.ai' }, variables: { token: 'ABC123' } },
        {
          ...ENQUEUE_BASE_DEFAULTS,
          removeOnComplete: true,
          removeOnFail: true,
          priority: 0,
        },
      )
      if (!login) throw new Error('Expected the login job to be created')

      // The digest worker is held by the first send, with every other send still queued.
      await expect(transactional.settled(login)).resolves.toBe('completed')
      expect(started).toHaveLength(1)

      release.resolve()
      await Promise.all(digests.map(job => harness!.settled(job)))
      expect(started).toHaveLength(DIGEST_SENDS)
    } finally {
      // A failed assertion must not leave a handler holding the worker open.
      release.resolve()
    }
  })
})
