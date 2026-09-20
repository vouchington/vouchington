import { createCodedError } from '@modules/on-error/create-coded-error'
import { TOPIC_RECOMMENDATIONS_APPROVED_HANDLER_UNREGISTERED } from '@modules/on-error/error-codes'

export type RecommendationApprovedHandler = (
  recommendationPostId: string,
  topicId: string,
) => Promise<void>

let registeredHandler: RecommendationApprovedHandler | null = null

// @services/user-import-export registers its auto-follow handler here as a side effect of
// module load (see
// backend/services/user-import-export/register-auto-follow-on-approval-handler.mts) so
// topic-recommendations never imports user-import-export directly, which would
// recreate a workspace dependency cycle between the two packages.
export function registerRecommendationApprovedHandler(
  handler: RecommendationApprovedHandler,
): void {
  registeredHandler = handler
}

// Internal to topic-recommendations: only approve-topic-recommendation-side-effects.mts
// should call this. Throws instead of letting a topic-recommendation approval silently skip
// auto-following pending importers when the registration above never ran (e.g. a missing
// side-effect import at process boot).
export function getRegisteredRecommendationApprovedHandler(): RecommendationApprovedHandler {
  if (!registeredHandler) {
    throw createCodedError(
      500,
      'No recommendation-approved handler registered for topic-recommendations; @services/user-import-export must be imported for side effects before topic-recommendation approvals occur',
      TOPIC_RECOMMENDATIONS_APPROVED_HANDLER_UNREGISTERED,
    )
  }
  return registeredHandler
}
