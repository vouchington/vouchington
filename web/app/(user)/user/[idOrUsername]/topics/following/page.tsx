import { notFound } from 'next/navigation'
import { PaginatedUserTopicList } from '@/components/users/paginated-user-topic-list'
import { getUserTopicsCollection } from '@/lib/api/server'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const metadata = createNoIndexMetadata()

interface PageProps {
  params: Promise<{ idOrUsername: string }>
}

export default async function UserFollowingTopicsRoute({ params }: PageProps) {
  const { idOrUsername } = await params
  const topicsData = await getUserTopicsCollection(idOrUsername, 'following')
  if (!topicsData) notFound()

  return (
    <PaginatedUserTopicList
      initialData={topicsData}
      endpoint={`/api/v1/users/${encodeURIComponent(idOrUsername)}/topics/following`}
      emptyTitle='No followed topics'
      emptyDescription='This user is not following any topics.'
    />
  )
}
