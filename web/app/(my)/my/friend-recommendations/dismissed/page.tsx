export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { requireCurrentUser } from '@/lib/auth/require-current-user'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { UserUserRelationRoute } from '@/components/users/user-relation-route-pages'
import { USER_RELATION_ACTIONS } from '@/components/users/user-relation-actions'

export const metadata: Metadata = createNoIndexMetadata('Dismissed User Recommendations')

export default async function FindFriendsDismissedPage() {
  const currentUser = await requireCurrentUser()
  return (
    <div
      className='space-y-6'
      data-pw='find-friends-dismissed-page'
    >
      <UserUserRelationRoute
        idOrUsername={currentUser.id}
        listType='dismissed-recommendations'
        emptyTitle='No dismissed user recommendations'
        emptyDescription='You have not dismissed any user recommendations yet.'
        relationAction={USER_RELATION_ACTIONS.user.dismissed}
      />
    </div>
  )
}
