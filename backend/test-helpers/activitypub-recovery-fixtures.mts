import type { Job, Queue } from 'glide-mq'
import { background } from '../queues/background/queues.mts'
import {
  createBulkDistributeActivityEnqueue,
  distributionPageJobId,
} from '../queues/activitypub/enqueues/delivery.mts'
import { ACTIVITYPUB_DISTRIBUTE_ACTIVITY_JOB } from '../queues/background/enqueues/activitypub-jobs.mts'
import type {
  DistributeActivityData,
  RecoverOutboundDistributionData,
} from '../queues/background/enqueues/activitypub-domain.mts'
import {
  getEntityRelationMetadataOrThrow,
  upsertEntityRelation,
} from '../services/entity-relations/index.mts'
import { createRemoteActorFixture } from './ap-inbox-activity-fixtures.mts'

export function createRecoveryBulkEnqueues(
  queue: Queue<DistributeActivityData | RecoverOutboundDistributionData>,
  queueName: string,
  queuePrefix: string,
) {
  const isolatedBulkQueue = {
    name: queueName,
    priorityKind: 'ranked' as const,
    addBulk: (jobs: Parameters<typeof queue.addBulk>[0]) => queue.addBulk(jobs),
  }
  return {
    // The logical name matches the real background dispatch context; the native namespace stays isolated.
    production: createBulkDistributeActivityEnqueue({
      queue: isolatedBulkQueue,
      queueName: 'background',
      queuePrefix,
    }),
    raw: (inputs: DistributeActivityData[]) =>
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
  }
}

export async function addRemoteFollowerAudience(sourceUserId: string): Promise<void> {
  const followers = await Promise.all([createRemoteActorFixture(), createRemoteActorFixture()])
  const relation = getEntityRelationMetadataOrThrow({
    subjectType: 'remote_actor',
    objectType: 'user',
    predicate: 'follow',
  })
  await Promise.all(
    followers.map(follower =>
      upsertEntityRelation(null, relation, { id: follower.id }, [{ id: sourceUserId }], {
        origin: 'remote',
      }),
    ),
  )
}

export async function getActivityDeliveryJobs(activityId: string): Promise<Job[]> {
  const deliveries = await background.searchJobs({ name: 'activitypub.deliverActivity' })
  return deliveries.filter(job => (job.data as { activityId?: string }).activityId === activityId)
}

export function getRetainedContinuationId(data: DistributeActivityData): string {
  const receipt = data as DistributeActivityData & {
    dispatchReceipt?: { next?: DistributeActivityData; nextAdmitted?: boolean }
  }
  const next = receipt.dispatchReceipt?.next
  if (!next?.cursor || !receipt.dispatchReceipt?.nextAdmitted)
    throw new Error('Expected an admitted continuation in the completed root receipt')
  return distributionPageJobId(next)
}
