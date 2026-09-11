import { notFound } from 'next/navigation'
import { getUserUsersCollection } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { UserList } from './user-list'
import { getOwnerRelationAction } from './user-relation-owner-action'
import type { RelationManagementActionConfig } from './relation-management-action'

export async function UserUserRelationRoute({
  idOrUsername,
  listType,
  emptyTitle,
  emptyDescription,
  relationAction,
}: {
  idOrUsername: string
  listType: 'blocked' | 'muted' | 'subscribed-posts' | 'dismissed-recommendations'
  emptyTitle: string
  emptyDescription: string
  relationAction: RelationManagementActionConfig
}) {
  const [usersData, resolvedRelationAction, currentUser] = await Promise.all([
    getUserUsersCollection(idOrUsername, listType),
    getOwnerRelationAction(idOrUsername, relationAction),
    getCurrentUser(),
  ])
  if (!usersData) notFound()

  return (
    <UserList
      users={usersData.results}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      relationAction={resolvedRelationAction}
      currentUserId={currentUser?.id}
      muted={usersData.muted}
    />
  )
}
