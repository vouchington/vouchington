export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import { getCommunity, getCommunityPosts, getCommunityPinnedPosts } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { PinnedPostsManager } from '@/components/communities/pinned-posts-manager'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'
import { getTranslations } from '@/lib/i18n/get-translations'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getCommunity(slug)
  if (!data) return {}
  return createNoIndexMetadata(`Pinned Posts — ${data.community.name}`)
}

export default async function CommunityPinnedPostsPage({ params }: PageProps) {
  const t = await getTranslations()
  const { slug } = await params
  const currentUser = await getCurrentUser()

  if (!currentUser) {
    redirect('/login')
  }

  const communityData = await getCommunity(slug)

  if (!communityData) {
    notFound()
  }

  const { community, membership } = communityData
  const role = membership?.removed_at == null ? membership?.role : null

  if (role !== 'owner' && role !== 'moderator') {
    notFound()
  }

  const [postsData, pinnedData] = await Promise.all([
    getCommunityPosts(slug),
    getCommunityPinnedPosts(slug),
  ])

  return (
    <div className='space-y-6'>
      <div>
        <h2
          className='text-2xl font-bold'
          data-pw='pinned-posts-page-heading'
        >
          {t('extracted.pinnedPosts.page.pinnedPosts_b9f4e733')}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.pinnedPosts.page.pinUpTo3PostsTo_54efabba')}
        </p>
      </div>
      <PinnedPostsManager
        communitySlug={community.slug}
        posts={postsData}
        initialPinnedPosts={pinnedData.pinned_posts}
      />
    </div>
  )
}
