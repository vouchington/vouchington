/**
 * Factory function for topic route layouts.
 *
 * Each factory closes over a hardcoded topicType constant, eliminating the
 * runtime getTopicTypeFromSlug() check that was needed in the old catch-all
 * [topicType] dynamic segment.
 */

import { TopicRouteLayout } from '@/components/topics/topic-route-layout'
import type { TopicTypes } from '@/types/topics'

interface LayoutProps {
  params: Promise<{ id: string }>
  children: React.ReactNode
}

export function createTopicLayout(topicType: TopicTypes) {
  return async function TopicLayout({ params, children }: LayoutProps) {
    const { id } = await params
    return (
      <TopicRouteLayout
        id={id}
        topicType={topicType}
      >
        {children}
      </TopicRouteLayout>
    )
  }
}
