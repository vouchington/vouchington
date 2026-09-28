import { registerPostCommitAction, type OwnedTransaction } from '@data-stores/psql'
import type { EnqueueReturnType } from '@voucha/types'
import type { EntityRelationMetadata } from './metadata.mts'
import type { EntityIdentifier, UpsertEntityTypes } from './upsert-helpers.mts'
import type { EntityRelation } from './upsert-helpers-types.mts'
import {
  enqueueBulkReconcilePostNotifications,
  enqueueBulkReconcileRssFeedItemNotifications,
} from '@queues/notifications/enqueues'

export function enqueueNotificationReconcileForRelations(
  relation: EntityRelationMetadata,
  relations: EntityRelation[],
) {
  return getNotificationReconcileEnqueue(relation, relations)?.()
}

export function deferNotificationReconcileForRelations(query: OwnedTransaction): {
  set: (relation: EntityRelationMetadata, relations: EntityRelation[]) => void
} {
  let enqueue: (() => EnqueueReturnType) | undefined
  registerPostCommitAction(query, async () => {
    await enqueue?.()
  })
  return {
    set(relation, relations) {
      enqueue = getNotificationReconcileEnqueue(relation, relations)
    },
  }
}

function getNotificationReconcileEnqueue(
  relation: EntityRelationMetadata,
  relations: EntityRelation[],
): (() => EnqueueReturnType) | undefined {
  const plan = getNotificationReconcilePlan(relation, relations)
  if (!plan) return
  if (plan.type === 'post') return () => enqueueBulkReconcilePostNotifications(plan.subjectIds)
  return () => enqueueBulkReconcileRssFeedItemNotifications(plan.subjectIds)
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
