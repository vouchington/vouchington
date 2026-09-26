import { getEntityRelations } from '@/lib/api/server'
import { topicApiId } from '@/lib/links/entity-href'
import type { Topic } from '@/types/topics'
import { TAG_ASIDE_SEARCH_PARAMS } from './tag-relation-configs'
import { TopicCategoryTagsAsideView } from './topic-category-tags-aside-view'

interface TopicCategoryTagsAsideProps {
  topic: Topic
  isAuthenticated: boolean
}

export async function TopicCategoryTagsAside({
  topic,
  isAuthenticated,
}: TopicCategoryTagsAsideProps) {
  const response = await getEntityRelations('topic', topicApiId(topic), 'category', 'topic', {
    searchParams: TAG_ASIDE_SEARCH_PARAMS,
  })
  const relations = response.results.flatMap(result => {
    const relation = response.entity_relations[result.id]
    return relation ? [relation] : []
  })

  return (
    <TopicCategoryTagsAsideView
      electionVotes={response.election_votes}
      isAuthenticated={isAuthenticated}
      relations={relations}
      topic={topic}
    />
  )
}
