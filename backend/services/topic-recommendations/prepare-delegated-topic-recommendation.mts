import type { TransactionQuery } from '@data-stores/psql'
import type { BasicUser } from '@voucha/types/entities/user'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { lockDelegatedPostActor } from '@services/posts/delegated-actor-lock'
import { prepareTopicRecommendation } from './create-topic-recommendation.mts'
import type { CreateTopicRecommendationInput } from './types.mts'

/** Delegated recommendation creation revalidates the actor inside its admission transaction. */
export async function prepareDelegatedTopicRecommendation(
  currentUser: BasicUser,
  provenance: ContentProvenance,
  input: CreateTopicRecommendationInput,
  query: TransactionQuery,
) {
  await lockDelegatedPostActor(query, currentUser.id)
  return prepareTopicRecommendation(currentUser, provenance, input, { query })
}
