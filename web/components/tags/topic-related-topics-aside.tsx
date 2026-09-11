import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getEntityRelations } from '@/lib/api/server'
import { TopicRelatedTopicsAsideContent } from './topic-related-topics-aside-content'
import { TopicRelatedTopicsAsideStreaming } from './topic-related-topics-aside-streaming'
import { renderAuthGatedStreaming } from './render-auth-gated-streaming'
import type { Topic } from '@/types/topics'
import { TAG_ASIDE_SEARCH_PARAMS } from './tag-relation-configs'
import { getTranslations } from '@/lib/i18n/get-translations'

interface TopicRelatedTopicsAsideProps {
  topic: Topic
}

export async function TopicRelatedTopicsAside({ topic }: TopicRelatedTopicsAsideProps) {
  const [currentUser, t] = await Promise.all([getCurrentUser(), getTranslations()])
  const responsePromise = getEntityRelations('topic', topic.id, 'related', 'topic', {
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
        <TopicRelatedTopicsAsideContent
          topic={topic}
          relations={relations}
          showManageButton={false}
          showVoting={false}
          response={response}
          t={t}
        />
      )
    },
    renderStreaming: (
      <TopicRelatedTopicsAsideStreaming
        topic={topic}
        responsePromise={responsePromise}
      />
    ),
  })
}
