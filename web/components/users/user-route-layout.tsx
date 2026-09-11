import { notFound } from 'next/navigation'
import { getUserProfile, GET_USER_PROFILE_WITH_BIO } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { createUserPathname } from '@/lib/links/entity-href'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { createBreadcrumbSchema } from '@/lib/seo/structured-data'
import { getDisplayName, isProfileOwner } from '@/lib/users/user-helpers'
import { UserDetailLayout } from './user-detail-layout'
import { isAdmin, isOfficialAccount } from '@/lib/auth/official-account'

interface UserRouteLayoutProps {
  idOrUsername: string
  children: React.ReactNode
}

export async function UserRouteLayout({ idOrUsername, children }: UserRouteLayoutProps) {
  const [profileData, currentUser] = await Promise.all([
    getUserProfile(idOrUsername, GET_USER_PROFILE_WITH_BIO),
    getCurrentUser(),
  ])

  if (!profileData) {
    notFound()
  }

  const user = profileData.user
  const isOwner = isProfileOwner(currentUser, user)
  const viewerIsAdmin = isAdmin(currentUser)

  const displayName = getDisplayName(user)
  const canonicalPath = createUserPathname(user)
  const breadcrumbItems = buildBreadcrumbsForPath(canonicalPath, {
    isAuthenticated: !!currentUser,
    tail: [{ name: displayName, path: canonicalPath }],
  })

  return (
    <>
      {breadcrumbItems.length > 0 && (
        <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems)} />
      )}
      <UserDetailLayout
        user={user}
        metrics={profileData.user_metrics}
        profileLinks={profileData.profile_links ?? []}
        aboutHtml={profileData.user_bio_html}
        breadcrumbItems={breadcrumbItems}
        viewer={{ isAdmin: viewerIsAdmin, isOwner }}
        asides={{
          isVisible: currentUser != null && currentUser.id !== user.id,
          canCreateTrustSignal: currentUser != null && !isOfficialAccount(currentUser),
          canManageUserTags:
            currentUser != null && (!isOfficialAccount(currentUser) || viewerIsAdmin),
        }}
      >
        {children}
      </UserDetailLayout>
    </>
  )
}
