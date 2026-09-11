import { EmptyState } from '@/components/shared/empty-state'
import { TopicCard } from '@/components/topics/topic-card'
import type { Topic } from '@/types/topics'
import {
  RelationManagementAction,
  type RelationManagementActionConfig,
} from './relation-management-action'

export function UserTopicList({
  topics,
  emptyTitle,
  emptyDescription,
  relationAction,
}: {
  topics: Topic[]
  emptyTitle: string
  emptyDescription: string
  relationAction?: RelationManagementActionConfig
}) {
  if (topics.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
      />
    )
  }

  return (
    <div className='space-y-4'>
      {topics.map(topic => (
        <div
          key={topic.id}
          className='space-y-2'
        >
          <TopicCard
            topic={topic}
            hideBookmarkActions={!!relationAction}
          />
          {relationAction ? (
            <RelationManagementAction
              entityId={topic.id}
              config={relationAction}
            />
          ) : null}
        </div>
      ))}
    </div>
  )
}
