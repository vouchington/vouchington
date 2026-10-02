import type { QueryExecutor } from '@data-stores/psql'
import {
  getActiveClassifierConfigurationBySlugFromPrimary,
  type ActiveClassifierConfiguration,
} from '@services/classifiers'
import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'

/**
 * The seeded `community-moderation` classifier at its active prompt version. A missing or
 * miswired classifier throws rather than returning null, so a real run stays eligible for the
 * sweep and a preview never silently judges by another model.
 */
export async function getActiveCommunityModerationClassifier(
  query?: QueryExecutor,
): Promise<ActiveClassifierConfiguration> {
  const classifier = await getActiveClassifierConfigurationBySlugFromPrimary(
    COMMUNITY_MODERATION_CLASSIFIER_SLUG,
    query,
  )
  if (!classifier) {
    throw new Error(
      `Classifier configuration for slug '${COMMUNITY_MODERATION_CLASSIFIER_SLUG}' not found`,
    )
  }
  if (classifier.candidateKind !== 'community_prompt') {
    throw new Error('Community moderation classifier must use community prompt candidates')
  }
  return classifier
}
