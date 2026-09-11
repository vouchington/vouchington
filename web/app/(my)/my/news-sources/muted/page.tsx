import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { UserRssFeedRelationRoute } from '@/components/users/user-relation-route-pages'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Muted News Sources')

export default async function MyNewsSourcesMutedPage() {
  const currentUser = await requireCurrentUser()

  return (
    <div
      className='space-y-6'
      data-pw='my-news-sources-muted-page'
    >
      <BookmarkPageHeader routeKey='news-sources/muted' />
      <UserRssFeedRelationRoute
        idOrUsername={currentUser.id}
        listType='muted'
        feedType='article'
        emptyTitle='No muted news sources'
        emptyDescription='There are no muted news sources to show.'
      />
    </div>
  )
}
