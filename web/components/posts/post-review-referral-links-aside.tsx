import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getPrioritizedReferralLinks } from '@/lib/api/server'
import { ReferralLinksAsideContent } from '@/components/referral-links/referral-links-aside-content'
import { ReferralLinksAsideStreaming } from '@/components/referral-links/referral-links-aside-streaming'
import { renderAuthGatedStreaming } from '@/components/tags/render-auth-gated-streaming'
import { getTopicTypeSlug } from '@/types/topics'
import type { Post } from '@/types/posts'

interface PostReviewReferralLinksAsideProps {
  post: Post
}

export async function PostReviewReferralLinksAside({ post }: PostReviewReferralLinksAsideProps) {
  if (post.post_type !== 'review') return null

  const ratings = post.review_topic_ratings ?? []

  // Find the first topic that has a referral program
  let referralProgramId: string | null = null
  let topicId: string | null = null
  let topicSlug: string | null = null
  let topicType: string | null = null

  for (const r of ratings) {
    const topic = r.topic
    if (!topic) continue
    if (topic.topic_type === 'referral_program') {
      referralProgramId = topic.id
      topicId = topic.id
      topicSlug = topic.slug
      topicType = getTopicTypeSlug(topic.topic_type)
      break
    }
    if (topic.referral_program_id) {
      referralProgramId = topic.referral_program_id
      topicId = topic.referral_program_id
      topicSlug = topic.referral_program_slug ?? null
      topicType = getTopicTypeSlug('referral_program')
      break
    }
  }

  if (!referralProgramId || !topicId || !topicType) return null

  const responsePromise = getPrioritizedReferralLinks(referralProgramId)
  const currentUser = await getCurrentUser()

  return renderAuthGatedStreaming({
    isAuthenticated: currentUser !== null,
    dataPromise: responsePromise,
    renderLoggedOut: response => (
      <ReferralLinksAsideContent
        topicId={topicId}
        topicSlug={topicSlug}
        topicType={topicType}
        response={response}
      />
    ),
    renderStreaming: (
      <ReferralLinksAsideStreaming
        topicId={topicId}
        topicSlug={topicSlug}
        topicType={topicType}
        responsePromise={responsePromise}
      />
    ),
  })
}
