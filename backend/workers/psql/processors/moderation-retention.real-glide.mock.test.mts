import {
  MODERATION_RETENTION_JOB_NAME,
  MODERATION_RETENTION_SCHEDULER_ID,
} from '@queues/psql/config'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { psql } from '@queues/psql/queues'
import { enqueueModerationRetentionCleanup } from '@queues/psql/enqueues/moderation-retention'
import { scheduledJobManifest } from '@queues/psql/enqueues/schedules'
import type { ModerationRetentionJobData } from '@queues/psql/types'
import { readEnqueuedJob } from '@voucha/test-helpers/queue-jobs'
import { processModerationRetentionCleanup } from './moderation-retention.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('moderation retention through real GlideMQ', () => {
  it('persists distinct serial continuations, reuses a receipted child and stops when finished', async () => {
    const rootJobId = `scheduled:moderation:${randomUUID()}`
    const parent = (await readEnqueuedJob(
      psql,
      await enqueueModerationRetentionCleanup(),
    )) as Job<ModerationRetentionJobData>
    const ownedIds = [parent.id]
    onTestFinished(async () => {
      const children = await psql.searchJobs({
        name: MODERATION_RETENTION_JOB_NAME,
        data: { rootJobId },
      })
      for (const child of children) await child.remove()
      for (const id of ownedIds) await (await psql.getJob(id))?.remove()
    })
    await parent.updateData({
      rootJobId,
      hop: 0,
      receipt: { deleted: 1, hasMore: true, remainingKinds: ['reports'] },
    })
    await processModerationRetentionCleanup(parent)
    const children = await psql.searchJobs({
      name: MODERATION_RETENTION_JOB_NAME,
      data: { rootJobId, hop: 1 },
    })
    expect(children).toHaveLength(1)
    const child = children[0]! as Job<ModerationRetentionJobData>
    expect(child.id).not.toBe(parent.id)
    expect(child.id).not.toContain(':')
    expect(child.data).toEqual({ rootJobId, hop: 1, remainingKinds: ['reports'] })
    expect(child.opts).toMatchObject({
      priority: 10,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
      removeOnComplete: 100,
      removeOnFail: 100,
      ordering: { key: 'psql:moderation-retention', concurrency: 1 },
    })
    const retriedParent = (await psql.getJob(parent.id)) as Job<ModerationRetentionJobData>
    await processModerationRetentionCleanup(retriedParent)
    expect(
      await psql.searchJobs({ name: MODERATION_RETENTION_JOB_NAME, data: { rootJobId, hop: 1 } }),
    ).toHaveLength(1)
    await child.updateData({
      ...child.data,
      receipt: { deleted: 0, hasMore: false, remainingKinds: [] },
    })
    await processModerationRetentionCleanup(child)
    expect(
      await psql.searchJobs({ name: MODERATION_RETENTION_JOB_NAME, data: { rootJobId, hop: 2 } }),
    ).toHaveLength(0)
  })

  it('receipts an actual empty bounded service run and schedules the real job directly', async () => {
    const parent = (await readEnqueuedJob(
      psql,
      await enqueueModerationRetentionCleanup(),
    )) as Job<ModerationRetentionJobData>
    onTestFinished(() => parent.remove())
    await parent.updateData({ remainingKinds: [] })
    expect(await processModerationRetentionCleanup(parent)).toEqual({
      deleted: 0,
      hasMore: false,
      remainingKinds: [],
    })
    expect((await psql.getJob(parent.id))?.data).toMatchObject({
      receipt: { deleted: 0, hasMore: false, remainingKinds: [] },
    })
    const schedule = scheduledJobManifest.jobs.find(
      job => job.schedulerId === MODERATION_RETENTION_SCHEDULER_ID,
    )
    expect(schedule?.template.name).toBe(MODERATION_RETENTION_JOB_NAME)
  })
})
