import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { UserUrlRelationRoute } from '@/components/users/user-relation-route-pages'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Saved Links')

export default async function MyUrlsSavedPage() {
  const currentUser = await requireCurrentUser()
  return (
    <div
      className='space-y-6'
      data-pw='my-urls-saved-page'
    >
      <BookmarkPageHeader routeKey='urls/saved' />
      <UserUrlRelationRoute idOrUsername={currentUser.id} />
    </div>
  )
}
