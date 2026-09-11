export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { InviteRedemption } from '@/components/communities/invite-redemption'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'
import { PageWithAside } from '@/components/page-with-aside'

interface PageProps {
  params: Promise<{ code: string }>
}

export const metadata: Metadata = createNoIndexMetadata('Join Community')

export default async function InviteRedemptionPage({ params }: PageProps) {
  const { code } = await params
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    redirect(`/login?next=/communities/invite/${code}`)
  }

  return (
    <PageWithAside showFooter={false}>
      <div className='max-w-md py-6'>
        <InviteRedemption code={code} />
      </div>
    </PageWithAside>
  )
}
