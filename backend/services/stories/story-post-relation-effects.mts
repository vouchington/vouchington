import type { PrivateUser } from '@services/users/types'
import type { EntityRelationMetadata } from '@services/entity-relations/metadata'
import { handleElectionVotes, type EntityRelation } from '@services/entity-relations/upsert-helpers'
import { enqueueNotificationReconcileForRelations } from '@services/entity-relations/notification-reconcile'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'

export type StoryPostRelationEffects = {
  relatedUrlRelation: EntityRelationMetadata
  relatedUrlRelations: EntityRelation[]
  categoryTopicRelation: EntityRelationMetadata
  categoryTopicRelations: EntityRelation[]
  handleVotes?: boolean
}

export async function dispatchStoryPostRelationEffects(
  storyTellerUser: PrivateUser,
  effects: StoryPostRelationEffects,
): Promise<void> {
  const { relatedUrlRelation, relatedUrlRelations, categoryTopicRelation, categoryTopicRelations } =
    effects
  if (effects.handleVotes !== false) {
    await Promise.all([
      handleElectionVotes(storyTellerUser, relatedUrlRelation, relatedUrlRelations),
      handleElectionVotes(storyTellerUser, categoryTopicRelation, categoryTopicRelations),
    ])
  }
  await Promise.all([
    enqueueNotificationReconcileForRelations(relatedUrlRelation, relatedUrlRelations),
    enqueueNotificationReconcileForRelations(categoryTopicRelation, categoryTopicRelations),
  ])
  if (relatedUrlRelations.length > 0) {
    void enqueueBulkCrawlUrls(relatedUrlRelations.map(relation => ({ urlId: relation.object_id })))
  }
}
