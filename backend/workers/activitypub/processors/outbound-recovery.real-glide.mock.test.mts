import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { activitypub } from '@queues/activitypub/queues'
import {
  ACTIVITYPUB_RECOVER_OUTBOUND_JOB,
  ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB,
} from '@queues/background/enqueues/activitypub-jobs'
import type { RecoverOutboundDistributionData } from '@queues/background/enqueues/activitypub-domain'
import { createTestUserDirect } from '@voucha/test-helpers'
import { insertUndispatchedTestUserFollow } from '@voucha/test-helpers/activitypub-distribution-state'
import { processRecoverOutboundDistributionJob } from './outbound-recovery.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('outbound ActivityPub recovery with PostgreSQL and GlideMQ', () => {
  it('re-enqueues a committed Follow with no original queue job and deduplicates a second sweep', async () => {
    const source = await createTestUserDirect()
    const target = await createTestUserDirect()
    const activityId = await insertUndispatchedTestUserFollow(source.id, target.id)
    const cursor = `${source.id}__00000000-0000-0000-0000-000000000000`
    const data: RecoverOutboundDistributionData = { source: 'follows', cursor }
    const ownedJobs: Job[] = []
    onTestFinished(async () => {
      await Promise.all(ownedJobs.map(job => job.remove()))
    })

    const firstSweep = await activitypub.add(ACTIVITYPUB_RECOVER_OUTBOUND_JOB.name, data, {
      ...ACTIVITYPUB_RECOVER_OUTBOUND_JOB.options,
      jobId: `test-ap-recovery-${randomUUID()}`,
    })
    if (!firstSweep) throw new Error('Expected first recovery dispatcher')
    ownedJobs.push(firstSweep)
    await expect(
      processRecoverOutboundDistributionJob(firstSweep as Job<RecoverOutboundDistributionData>),
    ).resolves.toMatchObject({ scanned: 1, hasMore: false })

    const rootId = `activitypub-distribute__${activityId}__start`
    const root = await activitypub.getJob(rootId)
    if (!root) throw new Error('Expected recovered distribution root')
    ownedJobs.push(root)
    expect(root).toMatchObject({
      name: ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB.name,
      data: {
        activityId,
        activityType: 'Follow',
        sourceUserId: source.id,
        targetUserId: target.id,
        recovery: true,
      },
    })

    const secondSweep = await activitypub.add(ACTIVITYPUB_RECOVER_OUTBOUND_JOB.name, data, {
      ...ACTIVITYPUB_RECOVER_OUTBOUND_JOB.options,
      jobId: `test-ap-recovery-${randomUUID()}`,
    })
    if (!secondSweep) throw new Error('Expected second recovery dispatcher')
    ownedJobs.push(secondSweep)
    await expect(
      processRecoverOutboundDistributionJob(secondSweep as Job<RecoverOutboundDistributionData>),
    ).resolves.toMatchObject({ scanned: 1, hasMore: false })
    const roots = (
      await activitypub.searchJobs({ name: ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB.name })
    ).filter(job => (job.data as { activityId?: string }).activityId === activityId)
    expect(roots.map(job => job.id)).toEqual([rootId])
  })
})
