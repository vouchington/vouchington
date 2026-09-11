import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getPrioritizedReferralLinks } from '@/lib/api/server'
import { ReferralLinksAsideContent } from './referral-links-aside-content'
import { ReferralLinksAsideStreaming } from './referral-links-aside-streaming'
import { renderAuthGatedStreaming } from '@/components/tags/render-auth-gated-streaming'
import { getTopicTypeSlug, type Topic } from '@/types/topics'

interface ReferralLinksAsideProps {
  topic: Topic
}

export async function ReferralLinksAside({ topic }: ReferralLinksAsideProps) {
  const referralProgramId =
    topic.topic_type === 'referral_program' ? topic.id : topic.referral_program_id
  if (!referralProgramId) return null

  const responsePromise = getPrioritizedReferralLinks(referralProgramId)
  const currentUser = await getCurrentUser()
  const topicType = getTopicTypeSlug(topic.topic_type)

  return renderAuthGatedStreaming({
    isAuthenticated: currentUser !== null,
    dataPromise: responsePromise,
    renderLoggedOut: response => (
      <ReferralLinksAsideContent
        topicId={topic.id}
        topicSlug={topic.slug}
        topicType={topicType}
        response={response}
      />
    ),
    renderStreaming: (
      <ReferralLinksAsideStreaming
        topicId={topic.id}
        topicSlug={topic.slug}
        topicType={topicType}
        responsePromise={responsePromise}
      />
    ),
  })
}
