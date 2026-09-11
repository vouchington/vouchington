import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { getUserTopicsCollection } from '@/lib/api/server'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { PaginatedUserTopicList } from '@/components/users/paginated-user-topic-list'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Recently Viewed Topics')

export default async function MyTopicsViewedPage() {
  const currentUser = await requireCurrentUser()
  const topicsData = await getUserTopicsCollection(currentUser.id, 'viewed')
  return (
    <div
      className='space-y-6'
      data-pw='my-topics-viewed-page'
    >
      <BookmarkPageHeader routeKey='topics/viewed' />
      <PaginatedUserTopicList
        initialData={topicsData!}
        endpoint={`/api/v1/users/${encodeURIComponent(currentUser.id)}/topics/viewed`}
        emptyTitle='No recently viewed topics'
        emptyDescription='You have not viewed any topics recently.'
      />
    </div>
  )
}
