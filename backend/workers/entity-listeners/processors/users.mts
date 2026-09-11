import { invalidate } from '@services/entity-cache/invalidate'
import { enqueueRecalculateUserVoteWeight } from '@queues/vote-weight/enqueues'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { enqueueLanguageDetection } from '@queues/language-detection/enqueues'

export const processUserCreated = async ({ id }: { id: string }) => {
  await invalidate.users(id)
  void enqueueRecalculateUserVoteWeight(id)
  void enqueueLanguageDetection('user', id)
}

export const processUserUpdated = async ({ id }: { id: string }) => {
  await invalidate.users(id)
  void enqueueLanguageDetection('user', id)
}

export const processUserLoggedIn = async ({ id }: { id: string }) => {
  await invalidate.users(id)
  void enqueueRecalculateUserVoteWeight(id)
}

export const processUserDeleted = async ({ id }: { id: string }) => {
  await invalidate.users(id)
}

export const processAutoFollowReferrer = async ({
  newUserId,
  referrerId,
}: {
  newUserId: string
  referrerId: string
}) => {
  const followRelation = getEntityRelationMetadataOrThrow({
    subjectType: 'user',
    predicate: 'follow',
    objectType: 'user',
  })
  const creator = { __entity_type: 'user' as const, id: newUserId, roles: [] }
  await upsertEntityRelation(creator, followRelation, { id: newUserId }, [{ id: referrerId }])
}
