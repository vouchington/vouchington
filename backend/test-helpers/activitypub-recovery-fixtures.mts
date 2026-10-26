import type { Job } from 'glide-mq'
import { background } from '../queues/background/queues.mts'
import { distributionPageJobId } from '../queues/activitypub/enqueues/delivery.mts'
import type { DistributeActivityData } from '../queues/background/enqueues/activitypub-domain.mts'
import {
  getEntityRelationMetadataOrThrow,
  upsertEntityRelation,
} from '../services/entity-relations/index.mts'
import { createRemoteActorFixture } from './ap-inbox-activity-fixtures.mts'

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
