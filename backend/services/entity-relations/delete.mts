import type { PrivateUser } from '@voucha/types/entities/user'
import { getEntityRelationMetadataOrThrow, type EntityRelationMetadata } from './metadata.mts'
import { enqueueNotificationReconcileAfterDelete } from './notification-reconcile.mts'
import { appendManyEntitiesWhereClause, appendSingleEntityWhereClause } from './sql-clauses.mts'
import type {
  UpsertEntityTypes,
  EntityIdentifier,
  EntityRelationOrigin,
} from './upsert-helpers.mts'
import type { QueryOptions } from '@data-stores/psql'
import { enqueueUndoFollowSideEffects } from './enqueue-undo-follow-side-effects.mts'
import { enqueueBulkEvaluateRssFeedDiscoverability } from '@queues/rss-feed-discoverability/enqueues'
import { runRelationPublicationMutation } from './publication-mutation.mts'
import { deleteBidirectionalRelationRows } from './delete-bidirectional-rows.mts'
import { enqueueRssFeedDiscoverabilityForDeletedPublisherTypeRelations } from './enqueue-rss-discoverability-for-deleted-publisher-types.mts'
import { runRelationTransaction } from './run-relation-transaction.mts'
import sql from 'sql-template-strings'
import {
  appendDeletedRelationReturning,
  getDeletedFollowPairs,
  type DeletedEntityRelation,
} from './deleted-relation-results.mts'
import { lockBidirectionalRelationMutation } from './bidirectional-pair-lock.mts'

export type SoftDeleteEntityRelationOptions = QueryOptions & {
  // Remote-origin deletes must not re-trigger outbound-destined side effects.
  origin?: EntityRelationOrigin
  capturePublication?: boolean
}
export const softDeleteEntityRelation = async (
  // Remote-origin deletes have no local deleter.
  deleter: PrivateUser | null,
  relation: EntityRelationMetadata,
  subject: UpsertEntityTypes | EntityIdentifier,
  objects: Array<UpsertEntityTypes | EntityIdentifier>,
  options?: SoftDeleteEntityRelationOptions,
): Promise<void> => {
  if (objects.length === 0) return
  const query = sql`/* softDeleteEntityRelation */
    UPDATE `
  query.append(relation.table_name)
  query.append(sql`
    SET deleted_at = NOW(), deleted_by_id = ${deleter?.id ?? null}
    WHERE `)

  appendSingleEntityWhereClause(query, subject, 'subject')
  query.append(sql` AND `)
  appendManyEntitiesWhereClause(query, objects, 'object')
  query.append(sql` AND deleted_at IS NULL`)
  appendDeletedRelationReturning(query, relation)

  if (!relation.bidirectional || relation.subject_type !== relation.object_type) {
    const deletedRelations = await runRelationPublicationMutation(
      options,
      relation.table_name,
      [subject.id],
      objects.map(object => object.id),
      relation.subject_type === 'user' ? [subject.id] : [],
      async transactionQuery => {
        const { rows } = await transactionQuery(query)
        return rows as DeletedEntityRelation[]
      },
    )
    if (options?.origin !== 'remote') {
      if (relation.predicate === 'follow' && relation.object_type === 'rss_feed') {
        void enqueueBulkEvaluateRssFeedDiscoverability(objects.map(object => object.id))
      }
      enqueueUndoFollowSideEffects(relation, getDeletedFollowPairs(deletedRelations))
      await enqueueRssFeedDiscoverabilityForDeletedPublisherTypeRelations(relation, [subject])
      enqueueNotificationReconcileAfterDelete(relation, subject)
    }
    return
  }

  const reverseRelation = getEntityRelationMetadataOrThrow({
    subjectType: relation.object_type,
    objectType: relation.subject_type,
    predicate: relation.predicate,
  })
  const reverseQuery = sql`/* softDeleteEntityRelation */
    UPDATE `
  reverseQuery.append(reverseRelation.table_name)
  reverseQuery.append(sql`
    SET deleted_at = NOW(), deleted_by_id = ${deleter?.id ?? null}
    WHERE `)
  appendManyEntitiesWhereClause(reverseQuery, objects, 'subject')
  reverseQuery.append(sql` AND `)
  appendSingleEntityWhereClause(reverseQuery, subject, 'object')
  reverseQuery.append(sql`
      AND deleted_at IS NULL
  `)
  await runRelationTransaction(options, async transactionQuery => {
    await lockBidirectionalRelationMutation(
      transactionQuery,
      relation.table_name,
      subject.id,
      objects.map(object => object.id),
      relation.subject_type === 'user' ? [subject.id, ...objects.map(object => object.id)] : [],
    )
    await deleteBidirectionalRelationRows(transactionQuery, query, reverseQuery)
  })
  /* c8 ignore next 3 -- no bidirectional relation is remote-actor-sourced today; see the matching
     note in upsert.mts's bidirectional branch. */
  if (options?.origin !== 'remote') {
    enqueueNotificationReconcileAfterDelete(relation, subject)
  }
}

export const softDeleteEntityRelationsForSubjects = async (
  deleter: PrivateUser | null,
  relation: EntityRelationMetadata,
  subjects: Array<UpsertEntityTypes | EntityIdentifier>,
  object: UpsertEntityTypes | EntityIdentifier,
  options?: SoftDeleteEntityRelationOptions,
): Promise<void> => {
  if (subjects.length === 0) return
  const query = sql`/* softDeleteEntityRelationsForSubjects */
    UPDATE `
  query.append(relation.table_name)
  query.append(sql`
    SET deleted_at = NOW(), deleted_by_id = ${deleter?.id ?? null}
    WHERE `)

  appendManyEntitiesWhereClause(query, subjects, 'subject')
  query.append(sql` AND `)
  appendSingleEntityWhereClause(query, object, 'object')
  query.append(sql` AND deleted_at IS NULL`)
  appendDeletedRelationReturning(query, relation)
  if (!relation.bidirectional || relation.subject_type !== relation.object_type) {
    const deletedRelations = await runRelationPublicationMutation(
      options,
      relation.table_name,
      subjects.map(subject => subject.id),
      [object.id],
      relation.subject_type === 'user' ? subjects.map(subject => subject.id) : [],
      async transactionQuery => {
        const { rows } = await transactionQuery(query)
        return rows as DeletedEntityRelation[]
      },
    )
    if (options?.origin !== 'remote') {
      if (relation.predicate === 'follow' && relation.object_type === 'rss_feed') {
        /* c8 ignore next -- lint-only fire-and-forget enqueue disposition. */
        void enqueueBulkEvaluateRssFeedDiscoverability([object.id])
      }
      const deletedSubjectIds = new Set(deletedRelations.map(row => row.subject_id))
      const deletedSubjects = subjects.filter(subject => deletedSubjectIds.has(subject.id))
      enqueueUndoFollowSideEffects(relation, getDeletedFollowPairs(deletedRelations))
      await enqueueRssFeedDiscoverabilityForDeletedPublisherTypeRelations(relation, subjects)
      deletedSubjects.forEach(subject => enqueueNotificationReconcileAfterDelete(relation, subject))
    }
    return
  }

  const reverseRelation = getEntityRelationMetadataOrThrow({
    subjectType: relation.object_type,
    objectType: relation.subject_type,
    predicate: relation.predicate,
  })

  const reverseQuery = sql`/* softDeleteEntityRelationsForSubjects */
    UPDATE `
  reverseQuery.append(reverseRelation.table_name)
  reverseQuery.append(sql`
    SET deleted_at = NOW(), deleted_by_id = ${deleter?.id ?? null}
    WHERE `)

  appendSingleEntityWhereClause(reverseQuery, object, 'subject')
  reverseQuery.append(sql` AND `)
  appendManyEntitiesWhereClause(reverseQuery, subjects, 'object')
  reverseQuery.append(sql`
      AND deleted_at IS NULL
  `)

  await runRelationTransaction(options, async transactionQuery => {
    await lockBidirectionalRelationMutation(
      transactionQuery,
      relation.table_name,
      object.id,
      subjects.map(subject => subject.id),
      relation.subject_type === 'user' ? [...subjects.map(subject => subject.id), object.id] : [],
    )
    await deleteBidirectionalRelationRows(transactionQuery, query, reverseQuery)
  })
}
