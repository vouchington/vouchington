import { enqueueBulkDistributeActivity } from '@queues/activitypub-delivery/enqueues'
import { enqueueBulkReconcileBlueskyFollow } from '@queues/bluesky-follow-propagation/enqueues'
import type { EntityRelationMetadata } from './metadata.mts'

export type DeletedFollowPair = {
  subjectId: string
  objectId: string
  activityPubUndoIdentity: {
    originalActivityId: string
    undoActivityId: string
  } | null
}

// Shared by softDeleteEntityRelation (single subject, many objects) and
// softDeleteEntityRelationsForSubjects (many subjects, single object) so both user->follow->user
// delete paths emit the same outbound-federation and Bluesky-propagation side effects for every
// relation actually deleted by the caller's UPDATE ... RETURNING — never for a relation an
// idempotent retry or an already-inactive unfollow/block left untouched.
export function enqueueUndoFollowSideEffects(
  relation: EntityRelationMetadata,
  deletedPairs: DeletedFollowPair[],
): void {
  if (
    relation.subject_type !== 'user' ||
    relation.predicate !== 'follow' ||
    relation.object_type !== 'user' ||
    deletedPairs.length === 0
  ) {
    return
  }

  const activityPubPairs = deletedPairs.flatMap(pair =>
    pair.activityPubUndoIdentity
      ? [
          {
            activityId: pair.activityPubUndoIdentity.undoActivityId,
            activityType: 'UndoFollow' as const,
            originalActivityId: pair.activityPubUndoIdentity.originalActivityId,
            sourceUserId: pair.subjectId,
            targetUserId: pair.objectId,
          },
        ]
      : [],
  )
  if (activityPubPairs.length > 0) {
    // Legacy Follow rows may not have the original delivered activity id. Sending an Undo with a
    // fabricated reference cannot retract that Follow, so only known identity generations are
    // eligible for ActivityPub distribution.
    void enqueueBulkDistributeActivity(activityPubPairs)
  }
  // Bluesky reconciliation derives desired state from the relation table, so every locally
  // deleted Follow remains eligible even when its historic ActivityPub identity is unknown.
  void enqueueBulkReconcileBlueskyFollow(
    deletedPairs.map(pair => ({ followerUserId: pair.subjectId, followeeUserId: pair.objectId })),
  )
}
