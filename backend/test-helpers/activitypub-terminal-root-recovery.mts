import { randomUUID } from 'node:crypto'
import { expect } from 'vitest'
import { Queue, Worker, type Job } from 'glide-mq'
import { scheduledJobManifest } from '../queues/activitypub/enqueues/schedules.mts'
import { distributionPageJobId } from '../queues/activitypub/enqueues/delivery.mts'
import {
  workerQueueConnection,
  workerQueuePrefix,
} from '../data-stores/valkey-core/glide-mq-client.mts'
import { ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB } from '../queues/background/enqueues/activitypub-jobs.mts'
import type {
  DistributeActivityData,
  RecoverOutboundDistributionData,
} from '../queues/background/enqueues/activitypub-domain.mts'
import { createTestUserDirect } from './index.mts'
import { insertUndispatchedTestUserFollow } from './activitypub-distribution-state.mts'
import { waitForRealGlideEvent } from './real-glide-terminal-deadline.mts'
import { pagedDispatchConfig } from '../data-stores/valkey-glide-mq/paged-dispatcher-config.mts'
import { overrideDynamicConfigFieldsForTest } from './dynamic-config.mts'
import { processRecoverOutboundDistributionJob } from '../workers/activitypub/processors/outbound-recovery.mts'
import { processDistributeActivityJob } from '../workers/activitypub/processors.mts'
import { background } from '../queues/background/queues.mts'
import { createFederatedUser } from './ap-inbox-activity-fixtures.mts'
import {
  addRemoteFollowerAudience,
  getActivityDeliveryJobs,
  getRetainedContinuationId,
} from './activitypub-recovery-fixtures.mts'

export async function assertTerminalActivityPubRootRecovery(
  terminalState: 'completed' | 'failed',
  options: { withReceipt?: boolean } = {},
): Promise<void> {
  await pagedDispatchConfig.waitForInitialization()
  const source = options.withReceipt ? await createFederatedUser() : await createTestUserDirect()
  const target = options.withReceipt ? await createFederatedUser() : await createTestUserDirect()
  const activityId = await insertUndispatchedTestUserFollow(source.id, target.id)
  if (options.withReceipt) await addRemoteFollowerAudience(source.id)
  const rootData: DistributeActivityData = {
    activityType: 'Follow',
    activityId,
    sourceUserId: source.id,
    targetUserId: target.id,
  }
  const rootId = distributionPageJobId(rootData)
  const queueName = `activitypub-root-recovery-${randomUUID()}`
  const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
  const queue = new Queue<DistributeActivityData | RecoverOutboundDistributionData>(
    queueName,
    connection,
  )
  const continuationJobs: Array<Job<DistributeActivityData | RecoverOutboundDistributionData>> = []
  const firstSettled = Promise.withResolvers<void>()
  let firstWorker: Worker<DistributeActivityData | RecoverOutboundDistributionData> | undefined
  let replayWorker: Worker<DistributeActivityData | RecoverOutboundDistributionData> | undefined
  let continuationId: string | undefined
  const restorePageSize = overrideDynamicConfigFieldsForTest(pagedDispatchConfig, {
    activitypub_page_size: 1,
  })
  try {
    const root = await queue.add(ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB.name, rootData, {
      ...ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB.options,
      attempts: 1,
      jobId: rootId,
    })
    if (!root) throw new Error('Expected initial distribution root')
    firstWorker = new Worker<DistributeActivityData | RecoverOutboundDistributionData>(
      queueName,
      async (job: Job<DistributeActivityData | RecoverOutboundDistributionData>) => {
        if (job.id !== rootId) throw new Error('Unexpected job in isolated root queue')
        if (terminalState === 'failed') throw new Error('Expected terminal root failure')
        if (options.withReceipt)
          await processDistributeActivityJob(job as Job<DistributeActivityData>)
      },
      { ...connection, blockTimeout: 1000 },
    )
    firstWorker.on('error', firstSettled.reject)
    firstWorker.on(terminalState, (job: Job | undefined) => {
      if (job?.id === rootId) firstSettled.resolve()
    })
    await firstWorker.waitUntilReady()
    await waitForRealGlideEvent(firstSettled.promise, `Initial ActivityPub root ${terminalState}`)
    expect(await (await queue.getJob(rootId))?.getState()).toBe(terminalState)
    await firstWorker.close(true)
    if (options.withReceipt) {
      const retained = await queue.getJob(rootId)
      if (!retained) throw new Error('Expected a retained completed root')
      continuationId = getRetainedContinuationId(retained.data as DistributeActivityData)
      const continuation = await background.getJob(continuationId)
      if (!continuation) throw new Error('Expected first-page continuation')
      await continuation.remove()
      const deliveries = await getActivityDeliveryJobs(activityId)
      expect(deliveries).toHaveLength(1)
      // Once a delivery record is gone, simple deduplication cannot hide a repeated first page.
      await Promise.all(deliveries.map(job => job.remove()))
    }
    const scheduled = scheduledJobManifest.jobs.find(
      job => job.schedulerId === 'activitypub-outbound-follows-recovery',
    )
    if (!scheduled) throw new Error('Expected scheduled Follow recovery')
    const scheduledOptions =
      typeof scheduled.template.opts === 'function'
        ? scheduled.template.opts()
        : scheduled.template.opts
    expect(scheduledOptions.ordering).toMatchObject({
      key: 'activitypub:outbound-recovery',
      concurrency: 1,
    })
    const recovery = await queue.add(
      scheduled.template.name,
      {
        source: 'follows',
        cursor: `${source.id}__00000000-0000-0000-0000-000000000000`,
      },
      { ...scheduledOptions, jobId: `test-ap-root-sweep-${randomUUID()}` },
    )
    if (!recovery) throw new Error('Expected scheduled recovery dispatcher')
    const recoveryResult = await processRecoverOutboundDistributionJob(
      recovery as Job<RecoverOutboundDistributionData>,
      {
        queue,
        // The sweep must perform WATCH-fenced reactivation for the stable root ID.
        enqueueBulk: inputs =>
          queue.addBulk(
            inputs.map(data => ({
              name: ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB.name,
              data,
              opts: {
                ...ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB.options,
                jobId: distributionPageJobId(data),
              },
            })),
          ),
        // Keep recovery continuations in this isolated queue.
        enqueueNext: async (data, options) => {
          const continuation = await queue.add(scheduled.template.name, data, {
            ...scheduledOptions,
            ...options,
          })
          if (!continuation) throw new Error('Expected recovery continuation')
          continuationJobs.push(continuation)
          return continuation
        },
      },
    )
    await recovery.remove()
    expect(recoveryResult.scanned).toBe(1)
    const readmitted = await queue.getJob(rootId)
    if (!readmitted) throw new Error('Expected the stable root ID to be re-admitted')
    expect(await readmitted.getState()).not.toBe(terminalState)
    expect(readmitted.data).toMatchObject({
      ...rootData,
      recovery: true,
    })
    if (options.withReceipt) expect(readmitted.data).toHaveProperty('dispatchReceipt')
    const admittedRoots = await queue.searchJobs({ name: ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB.name })
    expect(admittedRoots.map(job => job.id)).toEqual([rootId])
    await Promise.all(continuationJobs.map(job => job.remove()))
    continuationJobs.length = 0
    const replayed = Promise.withResolvers<DistributeActivityData>()
    replayWorker = new Worker<DistributeActivityData | RecoverOutboundDistributionData>(
      queueName,
      async (job: Job<DistributeActivityData | RecoverOutboundDistributionData>) => {
        if (job.id !== rootId) throw new Error('Unexpected recovery replay job')
        if (options.withReceipt)
          await processDistributeActivityJob(job as Job<DistributeActivityData>)
        return job.data
      },
      { ...connection, blockTimeout: 1000 },
    )
    replayWorker.on('error', replayed.reject)
    replayWorker.on('failed', (job, error) => {
      if (job?.id === rootId) replayed.reject(error)
    })
    replayWorker.on('completed', (job: Job | undefined) => {
      if (job?.id === rootId) replayed.resolve(job.data as DistributeActivityData)
    })
    await replayWorker.waitUntilReady()
    await expect(
      waitForRealGlideEvent(replayed.promise, 'Recovered ActivityPub root'),
    ).resolves.toMatchObject({ ...rootData, recovery: true })
    expect(await (await queue.getJob(rootId))?.getState()).toBe('completed')
    if (options.withReceipt) {
      if (!continuationId) throw new Error('Expected a saved continuation identity')
      const resumed = await background.getJob(continuationId)
      expect(resumed?.data).toMatchObject({ recovery: true })
      expect(resumed?.data).not.toHaveProperty('dispatchReceipt')
      expect(await getActivityDeliveryJobs(activityId)).toEqual([])
    }
  } finally {
    await replayWorker?.close(true)
    await firstWorker?.close(true)
    restorePageSize()
    if (continuationId) await (await background.getJob(continuationId))?.remove()
    if (options.withReceipt)
      await Promise.all((await getActivityDeliveryJobs(activityId)).map(job => job.remove()))
    await queue.obliterate({ force: true })
    await queue.close()
  }
}
