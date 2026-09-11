import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { SubmitLinkForm } from '@/components/posts/submit-link-form'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { PageWithAside } from '@/components/page-with-aside'
import { PostsDiscoveryAside } from '@/components/asides/posts-discovery-aside'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('Submit a Link')

export default async function CreateLinkPage() {
  const t = await getTranslations()
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <PageWithAside
      aside={PostsDiscoveryAside}
      showFooter={false}
    >
      <div className='max-w-2xl space-y-4'>
        <h1 className='text-2xl font-bold'>{t('extracted.create.page.submitALink_633b60d7')}</h1>
        <SubmitLinkForm />
      </div>
    </PageWithAside>
  )
}
