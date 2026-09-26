import { getEntityRelations } from '@/lib/api/server'
import { topicApiId } from '@/lib/links/entity-href'
import { getPublisherTypes } from '@/lib/api/server/topics'
import type { Topic } from '@/types/topics'
import { TAG_ASIDE_SEARCH_PARAMS } from './tag-relation-configs'
import { TopicPublisherTypesAsideView } from './topic-publisher-types-aside-view'

interface TopicPublisherTypesAsideProps {
  topic: Topic
  isAuthenticated: boolean
}

async function getPublisherTypeOptions(isAuthenticated: boolean) {
  if (!isAuthenticated) return undefined
  try {
    return (await getPublisherTypes()).publisher_types
  } catch {
    return undefined
  }
}

export async function TopicPublisherTypesAside({
  topic,
  isAuthenticated,
}: TopicPublisherTypesAsideProps) {
  if (topic.topic_type !== 'rss_feed') return null

  const response = await getEntityRelations('topic', topicApiId(topic), 'publisher_type', 'topic', {
    searchParams: TAG_ASIDE_SEARCH_PARAMS,
  })
  const relations = response.results.flatMap(result => {
    const relation = response.entity_relations[result.id]
    return relation ? [relation] : []
  })

  return (
    <TopicPublisherTypesAsideView
      electionVotes={response.election_votes}
      enumOptions={await getPublisherTypeOptions(isAuthenticated)}
      isAuthenticated={isAuthenticated}
      relations={relations}
      topic={topic}
    />
  )
}
