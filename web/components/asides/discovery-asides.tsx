import { TrendingTopicsAside } from '@/components/asides/trending-topics-aside'
import { ContributeCtaAside } from '@/components/asides/contribute-cta-aside'
import { CreateFirstPostAside } from '@/components/asides/create-first-post-aside'
import { CreateLandingPageAside } from '@/components/asides/create-landing-page-aside'
import { UpgradeMembershipAside } from '@/components/asides/upgrade-membership-aside'
import { AboutVouchaAside } from '@/components/asides/about-voucha-aside'
import { SequentialAsideSuspense } from '@/components/asides/sequential-aside-suspense'

export function DiscoveryAsides() {
  return (
    <>
      <AboutVouchaAside />
      <SequentialAsideSuspense>
        <TrendingTopicsAside />
        <ContributeCtaAside />
        <CreateFirstPostAside />
        <CreateLandingPageAside />
        <UpgradeMembershipAside />
      </SequentialAsideSuspense>
    </>
  )
}
