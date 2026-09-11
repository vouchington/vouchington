import { notFound } from 'next/navigation'
import { getUserCommunitiesCollection } from '@/lib/api/server'
import { PaginatedUserCommunityList } from '@/components/users/paginated-user-community-list'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata = createNoIndexMetadata()

interface PageProps {
  params: Promise<{ idOrUsername: string }>
}

export default async function UserMemberCommunitiesRoute({ params }: PageProps) {
  const t = await getTranslations()
  const { idOrUsername } = await params
  const communitiesData = await getUserCommunitiesCollection(idOrUsername, 'member')
  if (!communitiesData) notFound()

  return (
    <PaginatedUserCommunityList
      initialData={communitiesData}
      endpoint={`/api/v1/users/${encodeURIComponent(idOrUsername)}/communities/member`}
      emptyTitle={t('extracted.member.page.noMemberCommunities_90533240')}
      emptyDescription={t('extracted.member.page.thisUserIsNotAMember_1f8c3a56')}
    />
  )
}
