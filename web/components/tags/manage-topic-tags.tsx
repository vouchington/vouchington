import { notFound } from 'next/navigation'

import { ManageTagsTabs } from '@/components/tags/manage-tags-tabs'
import {
  getTopicTagTabsForTopicType,
  isTopicTagSegment,
  isTopicTagSegmentForTopicType,
} from '@/components/tags/tag-relation-configs'
import { getTopic } from '@/lib/api/server'

interface ManageTopicTagsProps {
  topicId: string
  objectType: string
}

export async function ManageTopicTags({ topicId, objectType }: ManageTopicTagsProps) {
  if (!isTopicTagSegment(objectType)) notFound()

  const topicData = await getTopic(topicId)
  if (!topicData) notFound()
  if (!isTopicTagSegmentForTopicType(objectType, topicData.topic.topic_type)) notFound()

  return (
    <ManageTagsTabs
      entityType='topic'
      entityId={topicData.topic.id}
      tabs={getTopicTagTabsForTopicType(topicData.topic.topic_type)}
      activeTab={objectType}
    />
  )
}
