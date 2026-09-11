import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { PageWithAside } from '@/components/page-with-aside'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Growth')

export default async function GrowthLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUser()

  if (
    !currentUser ||
    (!currentUser.roles.includes('administrator') && !currentUser.roles.includes('investor'))
  ) {
    redirect('/')
  }

  return <PageWithAside showFooter={false}>{children}</PageWithAside>
}
