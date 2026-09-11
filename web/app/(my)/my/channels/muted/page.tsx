import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { UserRssFeedRelationRoute } from '@/components/users/user-relation-route-pages'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Muted Channels')

export default async function MyChannelsMutedPage() {
  const currentUser = await requireCurrentUser()

  return (
    <div
      className='space-y-6'
      data-pw='my-channels-muted-page'
    >
      <BookmarkPageHeader routeKey='channels/muted' />
      <UserRssFeedRelationRoute
        idOrUsername={currentUser.id}
        listType='muted'
        feedType='video'
        emptyTitle='No muted channels'
        emptyDescription='There are no muted channels to show.'
      />
    </div>
  )
}
