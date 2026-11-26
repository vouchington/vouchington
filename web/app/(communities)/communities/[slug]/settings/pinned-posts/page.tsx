export const dynamic = 'force-dynamic'

import { getCommunity, getCommunityPosts, getCommunityPinnedPosts } from '@/lib/api/server'
import { PinnedPostsManager } from '@/components/communities/pinned-posts-manager'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'
import { getTranslations } from '@/lib/i18n/get-translations'
import { requireCommunityStaff } from '../require-community-staff'

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
  const community = await requireCommunityStaff(slug)

  const [postsData, pinnedData] = await Promise.all([
    // A picker, not a time-bound list: moderators can pin posts of any age.
    getCommunityPosts(slug, { searchParams: { time_range: 'all' } }),
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
