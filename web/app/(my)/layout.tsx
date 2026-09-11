import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { MyPageShell } from '@/components/my/my-page-shell'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { ConnectSocialAside } from '@/components/asides/connect-social-aside'
import { UpgradeMembershipAside } from '@/components/asides/upgrade-membership-aside'
import { AboutVouchaAside } from '@/components/asides/about-voucha-aside'
import { SequentialAsideSuspense } from '@/components/asides/sequential-aside-suspense'
import { PageWithAside } from '@/components/page-with-aside'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Settings')

export default async function MyLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <PageWithAside
      showFooter={false}
      aside={
        <>
          <AboutVouchaAside />
          <SequentialAsideSuspense>
            <ConnectSocialAside />
            <UpgradeMembershipAside />
          </SequentialAsideSuspense>
        </>
      }
    >
      <MyPageShell>{children}</MyPageShell>
    </PageWithAside>
  )
}
