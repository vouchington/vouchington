import { notFound } from 'next/navigation'
import { PaginatedUserList } from '@/components/users/paginated-user-list'
import { getUserUsersCollection } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata = createNoIndexMetadata()

interface PageProps {
  params: Promise<{ idOrUsername: string }>
}

export default async function UserFollowingUsersRoute({ params }: PageProps) {
  const t = await getTranslations()
  const { idOrUsername } = await params
  const [usersData, currentUser] = await Promise.all([
    getUserUsersCollection(idOrUsername, 'following'),
    getCurrentUser(),
  ])
  if (!usersData) notFound()

  return (
    <>
      <h1 className='sr-only'>{t('extracted.following.page.followingUsers_5f804115')}</h1>
      <PaginatedUserList
        initialData={usersData}
        endpoint={`/api/v1/users/${encodeURIComponent(idOrUsername)}/users/following`}
        emptyTitle='No followed users'
        emptyDescription='This user is not following anyone.'
        currentUserId={currentUser?.id}
      />
    </>
  )
}
