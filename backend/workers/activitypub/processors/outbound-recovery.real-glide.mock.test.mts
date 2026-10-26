import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Queue, Worker, type Job } from 'glide-mq'
import { activitypub } from '@queues/activitypub/queues'
import {
  ACTIVITYPUB_RECOVER_OUTBOUND_JOB,
  ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB,
} from '@queues/background/enqueues/activitypub-jobs'
import type {
  DistributeActivityData,
  RecoverOutboundDistributionData,
} from '@queues/background/enqueues/activitypub-domain'
import { createTestUserDirect, insertTestPost } from '@voucha/test-helpers'
import { insertUndispatchedTestUserFollow } from '@voucha/test-helpers/activitypub-distribution-state'
import { softDeleteUserFollowRelations } from '@services/entity-relations/soft-delete-user-follows'
import {
  listPendingOutboundDistributionPage,
  markActivityDistributionComplete,
} from '@services/activitypub-delivery'
import { upsertPostElectionVotes } from '@services/elections-votes/post/votes-upsert'
import {
  distributionPageJobId,
  getUndoFollowActivityId,
} from '@queues/activitypub/enqueues/delivery'
import { processRecoverOutboundDistributionJob } from './outbound-recovery.mts'
import { assertTerminalActivityPubRootRecovery } from '@voucha/test-helpers/activitypub-terminal-root-recovery'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { resumeDistributionPage } from './distribution-recovery.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('outbound ActivityPub recovery with PostgreSQL and GlideMQ', () => {
  it('keeps a completed root receipt and resumes its missing continuation without replaying its first page', async () => {
    expect.hasAssertions()
    await assertTerminalActivityPubRootRecovery('completed', { withReceipt: true })
  })

  it('rearms a completed continuation with its own saved page receipt', async () => {
    const queueName = `activitypub-child-receipt-${randomUUID()}`
    const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
    const queue = new Queue<DistributeActivityData>(queueName, connection)
    const sourceUserId = randomUUID()
    const targetPostId = randomUUID()
    const activityId = randomUUID()
    const child: DistributeActivityData = {
      activityType: 'Like',
      activityId,
      sourceUserId,
      targetPostId,
      cursor: randomUUID(),
    }
    const next: DistributeActivityData = { ...child, cursor: randomUUID() }
    const receipt = {
      result: { enqueued: 1, completed: false, cursor: next.cursor },
      next,
      nextAdmitted: true,
    }
    const id = distributionPageJobId(child)
    const settled = Promise.withResolvers<void>()
    const worker = new Worker<DistributeActivityData>(
      queueName,
      async (job: Job<DistributeActivityData>) => {
        if (job.id !== id) throw new Error('Unexpected continuation')
        const receipted = { ...job.data, dispatchReceipt: receipt }
        await job.updateData(receipted)
      },
      { ...connection, blockTimeout: 1000 },
    )
    worker.on('error', settled.reject)
    worker.on('completed', (job: Job | undefined) => {
      if (job?.id === id) settled.resolve()
    })
    try {
      await worker.waitUntilReady()
      await queue.add(ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB.name, child, {
        jobId: id,
        attempts: 1,
        removeOnComplete: 100,
      })
      await waitForRealGlideEvent(settled.promise, 'Completed ActivityPub child receipt')
      await worker.close()
      const added = await enqueueBulkReactivatingFinished({
        queue,
        inputs: [{ ...child, recovery: true as const }],
        jobIdOf: distributionPageJobId,
        enqueueBulk: inputs =>
          queue.addBulk(
            inputs.map(data => ({
              name: ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB.name,
              data,
              opts: { jobId: distributionPageJobId(data) },
            })),
          ),
        reactivatedInput: resumeDistributionPage,
      })
      expect(added.map(job => job.id)).toEqual([id])
      const resumed = await queue.getJob(id)
      expect(resumed?.data).toMatchObject({
        ...child,
        recovery: true,
        dispatchReceipt: receipt,
      })
      if (!resumed) throw new Error('Expected reactivated continuation')
      expect((resumed.data as { dispatchReceipt?: typeof receipt }).dispatchReceipt?.next).toEqual(
        next,
      )
    } finally {
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it.each(['completed', 'failed'] as const)(
    're-admits a retained %s distribution root from the scheduled Follow sweep',
    terminalState => {
      expect.hasAssertions()
      return assertTerminalActivityPubRootRecovery(terminalState)
    },
  )

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

  it('recovers the current UndoFollow identity from a deleted Follow relation', async () => {
    const source = await createTestUserDirect()
    const target = await createTestUserDirect()
    const originalActivityId = await insertUndispatchedTestUserFollow(source.id, target.id)
    await softDeleteUserFollowRelations(source.id, [target.id])
    const activityId = getUndoFollowActivityId(originalActivityId)
    const recovery = await activitypub.add(
      ACTIVITYPUB_RECOVER_OUTBOUND_JOB.name,
      { source: 'follows', cursor: `${source.id}__00000000-0000-0000-0000-000000000000` },
      {
        ...ACTIVITYPUB_RECOVER_OUTBOUND_JOB.options,
        jobId: `test-ap-undo-follow-recovery-${randomUUID()}`,
      },
    )
    if (!recovery) throw new Error('Expected UndoFollow recovery dispatcher')
    onTestFinished(() => recovery.remove())

    await processRecoverOutboundDistributionJob(recovery as Job<RecoverOutboundDistributionData>)
    const root = await activitypub.getJob(`activitypub-distribute__${activityId}__start`)
    if (!root) throw new Error('Expected recovered UndoFollow root')
    onTestFinished(() => root.remove())
    expect(root.data).toMatchObject({
      activityType: 'UndoFollow',
      activityId,
      originalActivityId,
      sourceUserId: source.id,
      targetUserId: target.id,
      recovery: true,
    })
  })

  it('recovers Like and UndoLike ballot rows with their distinct protocol identities', async () => {
    const voter = await createTestUserDirect()
    const postId = await insertTestPost({
      createdById: voter.id,
      title: 'Outbound vote processor recovery',
      slug: `outbound-vote-processor-recovery-${randomUUID()}`,
      markdown: 'A public post for recovery dispatch',
    })
    const after = `${postId}__00000000-0000-0000-0000-000000000000`
    await upsertPostElectionVotes(voter.id, [{ entityId: postId, score: 1 }])
    const likePage = await listPendingOutboundDistributionPage('votes', after, 1)
    const like = likePage.rows[0]
    if (!like || like.source !== 'votes') throw new Error('Expected pending Like ballot')
    const likeRecovery = await activitypub.add(
      ACTIVITYPUB_RECOVER_OUTBOUND_JOB.name,
      { source: 'votes', cursor: after },
      {
        ...ACTIVITYPUB_RECOVER_OUTBOUND_JOB.options,
        jobId: `test-ap-like-recovery-${randomUUID()}`,
      },
    )
    if (!likeRecovery) throw new Error('Expected Like recovery dispatcher')
    onTestFinished(() => likeRecovery.remove())
    await processRecoverOutboundDistributionJob(
      likeRecovery as Job<RecoverOutboundDistributionData>,
    )
    const likeRoot = await activitypub.getJob(`activitypub-distribute__${like.activityId}__start`)
    if (!likeRoot) throw new Error('Expected recovered Like root')
    onTestFinished(() => likeRoot.remove())
    expect(likeRoot.data).toMatchObject({
      activityType: 'Like',
      activityId: like.activityId,
      sourceUserId: voter.id,
      targetPostId: postId,
      recovery: true,
    })

    await markActivityDistributionComplete({
      activityType: 'Like',
      activityId: like.activityId,
      sourceUserId: voter.id,
      targetPostId: postId,
    })
    await upsertPostElectionVotes(voter.id, [{ entityId: postId, score: 0 }])
    const undoPage = await listPendingOutboundDistributionPage('votes', after, 1)
    const undo = undoPage.rows[0]
    if (!undo || undo.source !== 'votes') throw new Error('Expected pending UndoLike ballot')
    const undoRecovery = await activitypub.add(
      ACTIVITYPUB_RECOVER_OUTBOUND_JOB.name,
      { source: 'votes', cursor: after },
      {
        ...ACTIVITYPUB_RECOVER_OUTBOUND_JOB.options,
        jobId: `test-ap-undo-like-recovery-${randomUUID()}`,
      },
    )
    if (!undoRecovery) throw new Error('Expected UndoLike recovery dispatcher')
    onTestFinished(() => undoRecovery.remove())
    await processRecoverOutboundDistributionJob(
      undoRecovery as Job<RecoverOutboundDistributionData>,
    )
    const undoRoot = await activitypub.getJob(`activitypub-distribute__${undo.activityId}__start`)
    if (!undoRoot) throw new Error('Expected recovered UndoLike root')
    onTestFinished(() => undoRoot.remove())
    expect(undoRoot.data).toMatchObject({
      activityType: 'UndoLike',
      activityId: undo.activityId,
      originalActivityId: like.activityId,
      sourceUserId: voter.id,
      targetPostId: postId,
      recovery: true,
    })
  })
})
