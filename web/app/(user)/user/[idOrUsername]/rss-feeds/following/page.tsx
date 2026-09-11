import { notFound } from 'next/navigation'
import { PaginatedUserRssFeedList } from '@/components/users/paginated-user-rss-feed-list'
import { getUserRssFeedsCollection } from '@/lib/api/server'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'
export const metadata = createNoIndexMetadata()

interface PageProps {
  params: Promise<{ idOrUsername: string }>
  searchParams: Promise<{ feed_type?: string }>
}

export default async function UserFollowingRssFeedsRoute({ params, searchParams }: PageProps) {
  const t = await getTranslations()
  const [{ idOrUsername }, { feed_type: feedType }] = await Promise.all([params, searchParams])
  const rssFeedsData = await getUserRssFeedsCollection(idOrUsername, 'following', { feedType })
  if (!rssFeedsData) notFound()

  return (
    <PaginatedUserRssFeedList
      initialData={rssFeedsData}
      endpoint={`/api/v1/users/${encodeURIComponent(idOrUsername)}/rss-feeds/following`}
      params={{ feed_type: feedType }}
      emptyTitle={t('extracted.following.page.noFollowedSources_cf128ec1')}
      emptyDescription={t('extracted.following.page.thisUserIsNotFollowing_6d9a2f47')}
    />
  )
}
