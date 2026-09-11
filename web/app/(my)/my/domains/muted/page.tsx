import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { UserHostnameRelationRoute } from '@/components/users/user-relation-route-pages'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Muted Domains')

export default async function MyDomainsMutedPage() {
  const currentUser = await requireCurrentUser()
  return (
    <div
      className='space-y-6'
      data-pw='my-domains-muted-page'
    >
      <BookmarkPageHeader routeKey='domains/muted' />
      <UserHostnameRelationRoute
        idOrUsername={currentUser.id}
        listType='muted'
      />
    </div>
  )
}
