import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { getUserTopicsCollection } from '@/lib/api/server'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { PaginatedUserTopicList } from '@/components/users/paginated-user-topic-list'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Followed Topics')

export default async function MyTopicsFollowingPage() {
  const currentUser = await requireCurrentUser()
  const topicsData = await getUserTopicsCollection(currentUser.id, 'following')
  return (
    <div
      className='space-y-6'
      data-pw='my-topics-following-page'
    >
      <BookmarkPageHeader routeKey='topics/following' />
      <PaginatedUserTopicList
        initialData={topicsData!}
        endpoint={`/api/v1/users/${encodeURIComponent(currentUser.id)}/topics/following`}
        emptyTitle='No followed topics'
        emptyDescription='You are not following any topics yet.'
      />
    </div>
  )
}
