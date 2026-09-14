import dynamic from 'next/dynamic'
import type { User, UserMetrics, ProfileLink } from '@/types/user'
import type { BreadcrumbNavItem } from '@/lib/seo/structured-data'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { UserProfileHeader } from './user-profile-header'
import { UserProfileTabs } from './user-profile-tabs'
import { PageWithAside } from '@/components/page-with-aside'
import { ShareLandingPageBanner } from './share-landing-page-banner'
import { PopularCommunitiesAside } from '@/components/asides/popular-communities-aside'
import { SequentialAsideSuspense } from '@/components/asides/sequential-aside-suspense'
import UserVouchFollowContext from './user-vouch-follow-context'
import { UserTagsAside } from './user-tags-aside'
import { UserVouchElectionAside } from './user-vouch-election-aside'
import type { UserActionsAside as UserActionsAsideComponent } from './user-actions-aside'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const UserActionsAside = dynamic<Parameters<typeof UserActionsAsideComponent>[0]>(() =>
  import('./user-actions-aside').then(m => ({ default: m.UserActionsAside })),
)

interface UserDetailLayoutProps {
  user: User
  metrics?: UserMetrics
  profileLinks: ProfileLink[]
  aboutHtml?: string | null
  breadcrumbItems: BreadcrumbNavItem[]
  viewer: UserDetailViewer
  asides: UserDetailAsides
  children: React.ReactNode
}

interface UserDetailViewer {
  isAdmin: boolean
  isOwner: boolean
}

interface UserDetailAsides {
  isVisible: boolean
  canCreateTrustSignal: boolean
  canManageUserTags: boolean
}

export function UserDetailLayout({
  user,
  metrics,
  profileLinks,
  aboutHtml,
  breadcrumbItems,
  viewer,
  asides,
  children,
}: UserDetailLayoutProps) {
  const usernameOrId = user.username ?? user.id
  const displayName = user.display_account?.name || user.username || 'User'

  return (
    <PageWithAside
      aside={
        <>
          {viewer.isOwner && user.username ? (
            <ShareLandingPageBanner username={user.username} />
          ) : null}
          {asides.isVisible && <UserActionsAside userId={user.id} />}
          <SequentialAsideSuspense>
            {asides.isVisible && (
              <UserVouchElectionAside
                userId={user.id}
                displayName={displayName}
                canCreateTrustSignal={asides.canCreateTrustSignal}
              />
            )}
            {asides.isVisible && <UserVouchFollowContext id={user.id} />}
            {asides.isVisible && (
              <UserTagsAside
                userId={user.id}
                canManageUserTags={asides.canManageUserTags}
              />
            )}
            <PopularCommunitiesAside />
          </SequentialAsideSuspense>
        </>
      }
    >
      <div className='space-y-4'>
        <Breadcrumbs items={breadcrumbItems} />
        <UserProfileHeader
          user={user}
          metrics={metrics}
          profileLinks={profileLinks}
          aboutHtml={aboutHtml}
          isAdmin={viewer.isAdmin}
        />
        <UserProfileTabs
          usernameOrId={usernameOrId}
          metrics={metrics}
        />
        <div>{children}</div>
      </div>
    </PageWithAside>
  )
}
