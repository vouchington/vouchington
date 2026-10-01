import type { BasicUser } from '@voucha/types/entities/user'
import { getEntityRelationMetadataOrThrow, type EntityRelationMetadata } from './metadata.mts'
import { enqueueNotificationReconcileForRelations } from './notification-reconcile.mts'
import {
  prepareUpsertEntityRelationOptions,
  type UpsertEntityRelationOptions,
} from './upsert-options.mts'
import { buildInsertQuery } from './build-insert-query.mts'
import {
  handleElectionVotes,
  type EntityIdentifier,
  type EntityRelation,
  type InternalEntityRelationMutationResult,
  type UpsertEntityTypes,
  toPublicEntityRelations,
} from './upsert-helpers.mts'
import type { TransactionQuery } from '@data-stores/psql'
import { assertEntityRelationUpsertAllowed } from './assert-upsert-allowed.mts'
import { assertPublisherTypeObjectsAreValidInTransaction } from './assert-publisher-type-relation.mts'
import { enqueueBulkFollowNotification } from '@queues/notifications/enqueues'
import { enqueueBulkDistributeActivity } from '@queues/activitypub-delivery/enqueues'
import { enqueueBulkReconcileBlueskyFollow } from '@queues/bluesky-follow-propagation/enqueues'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { enqueueBulkEvaluateRssFeedDiscoverability } from '@queues/rss-feed-discoverability/enqueues'
import { maintainBookmarkBloomForRelations } from './bookmark-bloom-maintenance.mts'
import { enqueueRssFeedDiscoverabilityForPublisherTypeRelations } from './enqueue-rss-discoverability-for-publisher-relations.mts'
import { handleBidirectionalElectionVotes } from './handle-bidirectional-election-votes.mts'
import { runRelationPublicationMutation } from './publication-mutation.mts'
import { insertBidirectionalRelationRows } from './insert-bidirectional-rows.mts'
import { runRelationTransaction } from './run-relation-transaction.mts'
import { lockBidirectionalRelationMutation } from './bidirectional-pair-lock.mts'
import { lockPostPublicationPostScopes } from '@services/post-publication'

export type { UpsertEntityTypes, EntityIdentifier, EntityRelation }
export type { UpsertEntityRelationOptions } from './upsert-options.mts'
export { assertEntityRelationUpsertAllowed } from './assert-upsert-allowed.mts'
export const upsertEntityRelation = async (
  creator: BasicUser | null,
  relation: EntityRelationMetadata,
  subject: UpsertEntityTypes | EntityIdentifier,
  objects: Array<UpsertEntityTypes | EntityIdentifier>,
  options?: UpsertEntityRelationOptions,
): Promise<EntityRelation[]> => {
  if (objects.length === 0) return []
  const { deferredNotification, relationOptions, suppressNotificationReconcile } =
    prepareUpsertEntityRelationOptions(options)
  await assertEntityRelationUpsertAllowed(creator, relation, subject, objects, relationOptions)
  const query = buildInsertQuery(
    relation,
    creator,
    objects.map(object => ({ subject, object })),
    relationOptions,
  )
  if (!relation.bidirectional || relation.subject_type !== relation.object_type) {
    const internalRelations = await runRelationPublicationMutation(
      relationOptions,
      relation.table_name,
      [subject.id],
      objects.map(object => object.id),
      relation.subject_type === 'user' ? [subject.id] : [],
      async transactionQuery => {
        await assertPublisherTypeObjectsAreValidInTransaction(
          transactionQuery,
          relation,
          subject,
          objects,
        )
        const { rows } = await transactionQuery(query)
        return rows as InternalEntityRelationMutationResult[]
      },
    )
    const relations = toPublicEntityRelations(internalRelations)
    await maintainBookmarkBloomForRelations(relation, relations)
    await handleElectionVotes(creator, relation, relations, relationOptions)
    // Remote-origin writes must not re-trigger outbound-destined enqueues and delivery loops.
    if (relationOptions?.origin !== 'remote') {
      await enqueueRssFeedDiscoverabilityForPublisherTypeRelations(relation, relations)
      if (!suppressNotificationReconcile) {
        if (deferredNotification) deferredNotification.set(relation, relations)
        else void enqueueNotificationReconcileForRelations(relation, relations)
      }
      if (
        relation.subject_type === 'user' &&
        relation.predicate === 'follow' &&
        relation.object_type === 'user'
      ) {
        // Only fresh or resurrected follows emit a new outbound activity.
        const newlyActiveRelations = internalRelations.filter(r => r.newly_active)
        if (newlyActiveRelations.length > 0) {
          void enqueueBulkFollowNotification(
            newlyActiveRelations.map(r => ({ followeeId: r.object_id, followerId: r.subject_id })),
          )
          // Delivery no-ops unless both actors enabled federation.
          void enqueueBulkDistributeActivity(
            newlyActiveRelations.map(r => {
              if (!r.outbound_ap_follow_activity_id) {
                throw new Error('Active user follow relation is missing its ActivityPub identity')
              }
              return {
                activityId: r.outbound_ap_follow_activity_id,
                activityType: 'Follow' as const,
                sourceUserId: r.subject_id,
                targetUserId: r.object_id,
              }
            }),
          )
          // Reconciliation derives desired state and no-ops without linked Bluesky accounts.
          void enqueueBulkReconcileBlueskyFollow(
            newlyActiveRelations.map(r => ({
              followerUserId: r.subject_id,
              followeeUserId: r.object_id,
            })),
          )
        }
      }
      if (relation.object_type === 'url' && relations.length > 0) {
        void enqueueBulkCrawlUrls(relations.map(r => ({ urlId: r.object_id })))
      }
      if (
        relation.subject_type === 'user' &&
        relation.predicate === 'follow' &&
        relation.object_type === 'rss_feed' &&
        relations.length > 0
      ) {
        void enqueueBulkEvaluateRssFeedDiscoverability(relations.map(r => r.object_id))
      }
    }
    return relations
  }

  const reverseRelation = getEntityRelationMetadataOrThrow({
    subjectType: relation.object_type,
    objectType: relation.subject_type,
    predicate: relation.predicate,
  })
  const reverseQuery = buildInsertQuery(
    reverseRelation,
    creator,
    objects.map(object => ({ subject: object, object: subject })),
    relationOptions,
  )
  const run = async (
    transactionQuery: TransactionQuery,
  ): Promise<{
    relations: InternalEntityRelationMutationResult[]
    reverseRelations: InternalEntityRelationMutationResult[]
  }> => {
    await lockBidirectionalRelationMutation(
      transactionQuery,
      relation.table_name,
      subject.id,
      objects.map(object => object.id),
      relation.subject_type === 'user' ? [subject.id, ...objects.map(object => object.id)] : [],
    )
    if (relationOptions?.postMutationGuard?.postIds.length)
      await lockPostPublicationPostScopes(
        transactionQuery,
        relationOptions.postMutationGuard.postIds,
      )
    await relationOptions?.postMutationGuard?.assertAllowed(transactionQuery)
    return insertBidirectionalRelationRows<InternalEntityRelationMutationResult>(
      transactionQuery,
      query,
      reverseQuery,
    )
  }
  const { relations: internalRelations, reverseRelations: internalReverseRelations } =
    await runRelationTransaction(relationOptions, run)
  const relations = toPublicEntityRelations(internalRelations)
  const reverseRelations = toPublicEntityRelations(internalReverseRelations)
  // Post-commit failures cannot roll back this committed transaction.
  await Promise.all([
    maintainBookmarkBloomForRelations(relation, relations),
    maintainBookmarkBloomForRelations(reverseRelation, reverseRelations),
  ])
  await handleBidirectionalElectionVotes(
    creator,
    relation,
    relations,
    reverseRelation,
    reverseRelations,
    relationOptions,
  )
  /* c8 ignore next -- bidirectional relations cannot be remote-actor-sourced. */
  if (relationOptions?.origin !== 'remote') {
    if (!suppressNotificationReconcile) {
      if (deferredNotification) deferredNotification.set(relation, relations)
      else void enqueueNotificationReconcileForRelations(relation, relations)
    }
    if (relation.object_type === 'url' && relations.length > 0) {
      void enqueueBulkCrawlUrls(relations.map(r => ({ urlId: r.object_id })))
    }
  }
  return relations
}
