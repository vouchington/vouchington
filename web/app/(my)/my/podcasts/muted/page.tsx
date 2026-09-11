import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { UserRssFeedRelationRoute } from '@/components/users/user-relation-route-pages'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Muted Podcasts')

export default async function MyPodcastsMutedPage() {
  const currentUser = await requireCurrentUser()

  return (
    <div
      className='space-y-6'
      data-pw='my-podcasts-muted-page'
    >
      <BookmarkPageHeader routeKey='podcasts/muted' />
      <UserRssFeedRelationRoute
        idOrUsername={currentUser.id}
        listType='muted'
        feedType='podcast'
        emptyTitle='No muted podcasts'
        emptyDescription='There are no muted podcasts to show.'
      />
    </div>
  )
}
