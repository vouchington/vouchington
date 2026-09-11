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

export default async function UserFollowersRoute({ params }: PageProps) {
  const t = await getTranslations()
  const { idOrUsername } = await params
  const [usersData, currentUser] = await Promise.all([
    getUserUsersCollection(idOrUsername, 'followers'),
    getCurrentUser(),
  ])
  if (!usersData) notFound()

  return (
    <>
      <h1 className='sr-only'>{t('extracted.followers.page.followers_a145ab34')}</h1>
      <PaginatedUserList
        initialData={usersData}
        endpoint={`/api/v1/users/${encodeURIComponent(idOrUsername)}/users/followers`}
        emptyTitle='No followers'
        emptyDescription='This user does not have any followers yet.'
        currentUserId={currentUser?.id}
      />
    </>
  )
}
