import type { EntityRelationMetadata } from './metadata.mts'
import type { EntityRelation, EntityIdentifier, UpsertEntityTypes } from './upsert-helpers.mts'
import {
  enqueueBulkReconcilePostNotifications,
  enqueueBulkReconcileRssFeedItemNotifications,
} from '@queues/notifications/enqueues'

export function enqueueNotificationReconcileForRelations(
  relation: EntityRelationMetadata,
  relations: EntityRelation[],
) {
  const plan = getNotificationReconcilePlan(relation, relations)
  if (plan?.type === 'post') return enqueueBulkReconcilePostNotifications(plan.subjectIds)
  if (plan?.type === 'rss_feed_item')
    return enqueueBulkReconcileRssFeedItemNotifications(plan.subjectIds)
}

export function getNotificationReconcilePlan(
  relation: EntityRelationMetadata,
  relations: EntityRelation[],
): { type: 'post' | 'rss_feed_item'; subjectIds: string[] } | null {
  if (relation.predicate !== 'category' || relation.object_type !== 'topic') return null
  if (relation.subject_type !== 'post' && relation.subject_type !== 'rss_feed_item') return null
  return {
    type: relation.subject_type,
    subjectIds: relations.flatMap(row => (row.subject_id ? [row.subject_id] : [])),
  }
}

export function enqueueNotificationReconcileAfterDelete(
  relation: EntityRelationMetadata,
  subject: UpsertEntityTypes | EntityIdentifier,
) {
  if (relation.predicate !== 'category') return

  if (relation.subject_type === 'post' && relation.object_type === 'topic' && 'id' in subject) {
    void enqueueBulkReconcilePostNotifications([subject.id])
  }

  if (
    relation.subject_type === 'rss_feed_item' &&
    relation.object_type === 'topic' &&
    'id' in subject
  ) {
    /* c8 ignore next -- lint-only fire-and-forget enqueue disposition. */
    void enqueueBulkReconcileRssFeedItemNotifications([subject.id])
  }
}
