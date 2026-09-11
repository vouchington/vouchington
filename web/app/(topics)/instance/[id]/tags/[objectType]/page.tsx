import { notFound } from 'next/navigation'
import { isTopicTagSegment } from '@/components/tags/tag-relation-configs'
import type { Metadata } from 'next'
import { ManageTopicTags } from '@/components/tags/manage-topic-tags'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Manage Tags')

export default async function TopicTagsPage({
  params,
}: {
  params: Promise<{ id: string; objectType: string }>
}) {
  const { id, objectType } = await params
  if (!isTopicTagSegment(objectType)) {
    notFound()
  }
  return (
    <ManageTopicTags
      topicId={id}
      objectType={objectType}
    />
  )
}
