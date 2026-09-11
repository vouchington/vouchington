import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getCommunities } from '@/lib/api/server'
import { TopicCommunitiesAsideContent } from './topic-communities-aside-content'
import { TopicCommunitiesAsideStreaming } from './topic-communities-aside-streaming'
import { renderAuthGatedStreaming } from '@/components/tags/render-auth-gated-streaming'
import { getTranslations } from '@/lib/i18n/get-translations'
import type { Topic } from '@/types/topics'

interface TopicCommunitiesAsideProps {
  topic: Topic
}

export async function TopicCommunitiesAside({ topic }: TopicCommunitiesAsideProps) {
  const [currentUser, t] = await Promise.all([getCurrentUser(), getTranslations()])
  const responsePromise = getCommunities({
    searchParams: { topic: topic.id, sort: 'members', limit: '5' },
  }).catch(() => null)

  return renderAuthGatedStreaming({
    isAuthenticated: currentUser !== null,
    dataPromise: responsePromise,
    errorFallback: null,
    renderLoggedOut: response => {
      if (!response) return null
      const communities = (response?.results ?? []).flatMap(r => {
        const c = response?.communities?.[r.id]
        return c !== undefined ? [c] : []
      })
      if (communities.length === 0) return null
      return (
        <TopicCommunitiesAsideContent
          topic={topic}
          communities={communities}
          communityMetrics={response.community_metrics}
          t={t}
        />
      )
    },
    renderStreaming: (
      <TopicCommunitiesAsideStreaming
        topic={topic}
        responsePromise={responsePromise}
      />
    ),
  })
}
