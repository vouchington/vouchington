import { AboutVouchaAside } from '@/components/asides/about-voucha-aside'
import { TrendingTopicsAside } from '@/components/asides/trending-topics-aside'
import { ContributeCtaAside } from '@/components/asides/contribute-cta-aside'
import { UpgradeMembershipAside } from '@/components/asides/upgrade-membership-aside'
import { SequentialAsideSuspense } from '@/components/asides/sequential-aside-suspense'

export function PostsDiscoveryAside() {
  return (
    <>
      <AboutVouchaAside />
      <SequentialAsideSuspense>
        <TrendingTopicsAside />
        <ContributeCtaAside />
        <UpgradeMembershipAside />
      </SequentialAsideSuspense>
    </>
  )
}
