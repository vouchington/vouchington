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
  const topicIds = [...new Set(reviewedTopics.map(topic => topic.id))]
  const verifiedTopicIds = new Set<string>()
  for (let start = 0; start < topicIds.length; start += 100) {
    const chunk = topicIds.slice(start, start + 100)
    let after: string | undefined
    // One live verified claim can exist per topic. Even with a runtime page limit of one,
    // this bounded traversal finishes within the number of requested topics.
    let remainingPages = chunk.length
    while (remainingPages > 0) {
      remainingPages -= 1
      // oxlint-disable-next-line no-await-in-loop -- each cursor depends on the previous page
      const response = await getMyTopicClaims({
        topicIds: chunk,
        verifiedOnly: true,
        limit: 100,
        ...(after ? { after } : {}),
      })
      if (!response) return null
      for (const claim of response.results) {
        if (getTopicClaimState(claim) === 'verified') verifiedTopicIds.add(claim.topic_id)
      }
      if (!response.page_info.has_next_page) break
      after = response.page_info.end_cursor ?? undefined
      if (!after) break
    }
  }
  const matchingTopic = reviewedTopics.find(topic => verifiedTopicIds.has(topic.id))

  if (!matchingTopic) return null

  return (
    <DisputeReviewButton
      postId={postId}
      topicId={matchingTopic.id}
    />
  )
}
