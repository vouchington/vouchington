import { getMyTopicClaims } from '@/lib/api/server/topic-claims'
import { getTopicClaimState } from '@/types/topic-claims'
import { DisputeReviewButton } from './dispute-review-button'

interface ReviewedTopic {
  id: string
}

interface ReviewDisputeEntryProps {
  postId: string
  reviewedTopics: ReviewedTopic[]
}

/**
 * Server component that fetches the current user's topic claims and renders
 * the DisputeReviewButton if the user holds a verified (non-revoked) claim for
 * any of the reviewed topics.
 *
 * Supports reviews that rate multiple topics: the first matching topic is used.
 * Must only be rendered for authenticated users (currentUser != null at the call site).
 */
export async function ReviewDisputeEntry({ postId, reviewedTopics }: ReviewDisputeEntryProps) {
  const result = await getMyTopicClaims()
  if (!result) return null

  const { claims } = result
  const matchingTopic = reviewedTopics.find(topic =>
    claims.some(c => getTopicClaimState(c) === 'verified' && c.topic_id === topic.id),
  )

  if (!matchingTopic) return null

  return (
    <DisputeReviewButton
      postId={postId}
      topicId={matchingTopic.id}
    />
  )
}
