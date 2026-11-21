import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  MODERATION_SIGNALS_BAN_EVASION_JOB,
  MODERATION_SIGNALS_SPAM_DETECTION_JOB,
} from '@queues/background/enqueues/moderation-signals-jobs'
import { enqueueBulkSpamDetection } from './enqueues.mts'
import { backgroundQueue as moderationSignalsQueue } from '@voucha/test-helpers/shared-background-queue'

describe('enqueueBulkSpamDetection', () => {
  it('enqueues one job whose id is the version and source', async () => {
    const versionId = randomUUID()
    await enqueueBulkSpamDetection([versionId])
    const job = await moderationSignalsQueue.getJob(`${versionId}__spam_detection`)
    if (!job) throw new Error('Missing spam-detection job')

    expect(job).toMatchObject({
      id: `${versionId}__spam_detection`,
      name: MODERATION_SIGNALS_SPAM_DETECTION_JOB.name,
      data: { versionId },
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000, jitter: 0.2 },
      },
    })
    expect(job.opts.ordering).toMatchObject({ key: 'moderation-signals' })
    await enqueueBulkSpamDetection([versionId])
    await expect(
      moderationSignalsQueue.searchJobs({
        name: MODERATION_SIGNALS_SPAM_DETECTION_JOB.name,
        data: { versionId },
      }),
    ).resolves.toHaveLength(1)
  })

  it('keeps a spam-detection and a ban-evasion job apart under their own names', () => {
    expect(MODERATION_SIGNALS_SPAM_DETECTION_JOB.name).not.toBe(
      MODERATION_SIGNALS_BAN_EVASION_JOB.name,
    )
  })
})
