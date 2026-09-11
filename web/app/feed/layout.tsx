import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { FollowTopicsAside } from '@/components/asides/follow-topics-aside'
import { FindPeopleAside } from '@/components/asides/find-people-aside'
import { ConnectSocialAside } from '@/components/asides/connect-social-aside'
import { DiscoverCommunitiesAside } from '@/components/asides/discover-communities-aside'
import { UpgradeMembershipAside } from '@/components/asides/upgrade-membership-aside'
import { SequentialAsideSuspense } from '@/components/asides/sequential-aside-suspense'
import { PageWithAside } from '@/components/page-with-aside'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Your Feed')

function FeedAside() {
  return (
    <SequentialAsideSuspense>
      <FollowTopicsAside />
      <FindPeopleAside />
      <ConnectSocialAside />
      <DiscoverCommunitiesAside />
      <UpgradeMembershipAside />
    </SequentialAsideSuspense>
  )
}

export default async function FeedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return <PageWithAside aside={FeedAside}>{children}</PageWithAside>
}
