import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getEntityRelations } from '@/lib/api/server'
import { TopicFaqPostsAsideContent } from './topic-faq-posts-aside-content'
import { TopicFaqPostsAsideStreaming } from './topic-faq-posts-aside-streaming'
import { renderAuthGatedStreaming } from './render-auth-gated-streaming'
import type { Topic } from '@/types/topics'
import { TAG_ASIDE_SEARCH_PARAMS } from './tag-relation-configs'
import { getTranslations } from '@/lib/i18n/get-translations'

interface TopicFaqPostsAsideProps {
  topic: Topic
}

export async function TopicFaqPostsAside({ topic }: TopicFaqPostsAsideProps) {
  const [currentUser, t] = await Promise.all([getCurrentUser(), getTranslations()])
  const responsePromise = getEntityRelations('topic', topic.id, 'faq', 'post', {
    searchParams: TAG_ASIDE_SEARCH_PARAMS,
  })

  return renderAuthGatedStreaming({
    isAuthenticated: currentUser !== null,
    dataPromise: responsePromise,
    renderLoggedOut: response => {
      const { results, entity_relations } = response
      const relations = results.flatMap(r => {
        const rel = entity_relations[r.id]
        return rel ? [rel] : []
      })
      if (relations.length === 0) return null
      return (
        <TopicFaqPostsAsideContent
          topic={topic}
          relations={relations}
          showManageButton={false}
          response={response}
          t={t}
        />
      )
    },
    renderStreaming: (
      <TopicFaqPostsAsideStreaming
        topic={topic}
        responsePromise={responsePromise}
      />
    ),
  })
}
