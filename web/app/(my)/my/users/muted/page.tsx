import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { BookmarkPageHeader } from '@/components/my/bookmark-page-header'
import { UserUserRelationRoute } from '@/components/users/user-relation-route-pages'
import { USER_RELATION_ACTIONS } from '@/components/users/user-relation-actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('My Muted Users')

export default async function MyUsersMutedPage() {
  const currentUser = await requireCurrentUser()
  return (
    <div
      className='space-y-6'
      data-pw='my-users-muted-page'
    >
      <BookmarkPageHeader routeKey='users/muted' />
      <UserUserRelationRoute
        idOrUsername={currentUser.id}
        listType='muted'
        emptyTitle='No muted users'
        emptyDescription='You have not muted any users yet.'
        relationAction={USER_RELATION_ACTIONS.user.muted}
      />
    </div>
  )
}
