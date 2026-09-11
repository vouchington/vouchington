import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { PostForm } from '@/components/posts/post-form'
import type { Metadata } from 'next'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { PageWithAside } from '@/components/page-with-aside'
import { PostsDiscoveryAside } from '@/components/asides/posts-discovery-aside'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('New Article')

export default async function CreateArticlePage() {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  if (!currentUser.roles.includes('administrator')) redirect('/')

  return (
    <PageWithAside
      aside={PostsDiscoveryAside}
      showFooter={false}
    >
      <div className='max-w-2xl space-y-4'>
        <h1 className='text-2xl font-bold'>{t('extracted.create.page.newArticle_de2908bf')}</h1>
        <PostForm postType='article' />
      </div>
    </PageWithAside>
  )
}
