export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getCommunity, getCommunityListItemCounts, getCommunityMembers } from '@/lib/api/server'
import { returnNullForMissingEntity } from '@/lib/api/return-null-for-missing-entity'
import { CommunityAboutCopy } from '@/components/communities/community-about-copy'
import { CommunityHeader } from '@/components/communities/community-header'
import { CommunityModeratorsAside } from '@/components/communities/community-moderators-aside'
import { CommunityNav } from '@/components/communities/community-nav'
import { PageWithAside } from '@/components/page-with-aside'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { isModerationStaff } from '@/lib/auth/official-account'
import { getResolvedUiLocale } from '@/lib/i18n/get-resolved-ui-locale'
import { communityHref } from '@/lib/links/entity-href'
import { formatNumber, type NumberFormatLocale } from '@ts-shared/utils/format'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getTranslations } from '@/lib/i18n/get-translations'

interface LayoutProps {
  params: Promise<{ slug: string }>
  children: React.ReactNode
}

interface AsideProps {
  community: {
    markdown?: string | null
    default_language?: string | null
    lingua_rs_detected_language?: string | null
  }
  community_metrics?: { member_count: number; post_count: number } | null
  owners: Awaited<ReturnType<typeof getCommunityMembers>> | null
  moderators: Awaited<ReturnType<typeof getCommunityMembers>> | null
  uiLocale: NumberFormatLocale
}

async function CommunityAside({
  community,
  community_metrics,
  owners,
  moderators,
  uiLocale,
}: AsideProps) {
  const t = await getTranslations()
  return (
    <div className='space-y-4'>
      <div
        className='rounded-md border bg-card p-4'
        data-pw='community-about-aside'
      >
        <h2 className='mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground'>
          {t('extracted.slug.layout.about_4efca0d1')}
        </h2>
        <CommunityAboutCopy
          markdown={community.markdown}
          defaultLanguage={community.default_language}
          detectedLanguage={community.lingua_rs_detected_language}
          className='text-sm'
          emptyClassName='text-sm text-muted-foreground'
          emptyLabel={t('extracted.slug.layout.noDescriptionYet_6d962a3d')}
        />
        {community_metrics && (
          <div className='mt-4 space-y-1 text-sm'>
            <div className='flex justify-between'>
              <span className='text-muted-foreground'>
                {t('extracted.slug.layout.members_1044a4c0')}
              </span>
              <span className='font-medium'>
                {formatNumber(community_metrics.member_count, uiLocale)}
              </span>
            </div>
            <div className='flex justify-between'>
              <span className='text-muted-foreground'>
                {t('extracted.slug.layout.posts_a80811cf')}
              </span>
              <span className='font-medium'>
                {formatNumber(community_metrics.post_count, uiLocale)}
              </span>
            </div>
          </div>
        )}
      </div>
      <CommunityModeratorsAside
        owners={owners}
        moderators={moderators}
      />
    </div>
  )
}

export default async function CommunityLayout({ params, children }: LayoutProps) {
  const { slug } = await params
  const [communityData, uiLocale, currentUser] = await Promise.all([
    getCommunity(slug),
    getResolvedUiLocale(),
    getCurrentUser(),
  ])

  if (!communityData) {
    if (isModerationStaff(currentUser)) {
      return <PageWithAside>{children}</PageWithAside>
    }

    notFound()
  }

  const [listCounts, owners, moderators] = await Promise.all([
    returnNullForMissingEntity(getCommunityListItemCounts(slug), { nullStatusCodes: [403, 404] }),
    returnNullForMissingEntity(
      getCommunityMembers(slug, { searchParams: { role: 'owner', limit: 20 } }),
      { nullStatusCodes: [403, 404] },
    ),
    returnNullForMissingEntity(
      getCommunityMembers(slug, { searchParams: { role: 'moderator', limit: 20 } }),
      { nullStatusCodes: [403, 404] },
    ),
  ])

  const { community, community_metrics, membership } = communityData
  const hasPendingApplication = communityData.has_pending_application ?? false
  const currentUserRole = membership?.removed_at == null ? membership?.role : null
  const newsEnabled = !!listCounts && listCounts.topic + listCounts.rss_feed > 0
  const breadcrumbItems = buildBreadcrumbsForPath(communityHref(community), {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [
      { name: 'Communities', path: '/communities' },
      { name: community.name, path: communityHref(community) },
    ],
  })

  const asideContent = (
    <CommunityAside
      community={community}
      community_metrics={community_metrics}
      owners={owners}
      moderators={moderators}
      uiLocale={uiLocale}
    />
  )

  return (
    <PageWithAside aside={asideContent}>
      <div className='space-y-4'>
        <Breadcrumbs items={breadcrumbItems} />
        <CommunityHeader
          community={community}
          metrics={community_metrics ?? undefined}
          membership={membership}
          hasPendingApplication={hasPendingApplication}
        />
        <CommunityNav
          slug={community.slug}
          visibility={community.visibility}
          newsEnabled={newsEnabled}
          membership={membership}
          currentUserRole={currentUserRole}
          hasPendingApplication={hasPendingApplication}
        />
        {children}
      </div>
    </PageWithAside>
  )
}
