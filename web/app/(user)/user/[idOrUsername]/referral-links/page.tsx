import { notFound } from 'next/navigation'
import { PaginatedUserReferralLinkList } from '@/components/users/paginated-user-referral-link-list'
import { getUserReferralLinksList } from '@/lib/api/server/referral-links'
import { getUserProfile } from '@/lib/api/server/users'
import { getTranslations } from '@/lib/i18n/get-translations'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const metadata = createNoIndexMetadata()

interface PageProps {
  params: Promise<{ idOrUsername: string }>
}

export default async function UserReferralLinksRoute({ params }: PageProps) {
  const t = await getTranslations()
  const { idOrUsername } = await params
  const profile = await getUserProfile(idOrUsername)
  if (!profile) notFound()
  const links = await getUserReferralLinksList(profile.user.id)
  if (!links) notFound()

  return (
    <PaginatedUserReferralLinkList
      initialData={links}
      userId={profile.user.id}
      emptyTitle={t('extracted.referralLinks.referralLinksShowAll.noReferralLinksFound_ce6d5526')}
      emptyDescription={t(
        'extracted.referralLinks.referralLinkList.noReferralLinksHaveBeenAdded_3487a2e7',
      )}
    />
  )
}
