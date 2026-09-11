export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getCommunity, getCommunityPosts } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { CommunityFeed } from '@/components/communities/community-feed'
import { PostFilters } from '@/components/posts/post-filters'
import { ListSearchError } from '@/components/shared/list-search-error'
import { getListSearchErrorMessage, isListSearchErrorResult } from '@/lib/api/list-search-error'
import { getTranslations } from '@/lib/i18n/get-translations'
import { createExcerpt, createPageMetadata } from '@/lib/seo/metadata'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { createBreadcrumbSchema, createCommunityPageSchema } from '@/lib/seo/structured-data'
import { communityHref } from '@/lib/links/entity-href'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import type { Metadata } from 'next'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const VALID_SORTS = new Set(['hot', 'new'])

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const data = await getCommunity(slug)
  if (!data) return {}
  return createPageMetadata({
    title: data.community.name,
    description: data.community.markdown ? createExcerpt(data.community.markdown) : undefined,
    path: communityHref(data.community),
    contentLanguage:
      data.community.default_language ?? data.community.lingua_rs_detected_language ?? undefined,
  })
}

const PENDING_APPLICATION_MESSAGE = (
  <p
    className='text-sm text-muted-foreground'
    data-pw='community-feed-application-pending'
  >
    Your application is pending review. You&apos;ll be able to view posts once approved.
  </p>
)

export default async function CommunityPage({ params, searchParams }: PageProps) {
  const t = await getTranslations()
  const { slug } = await params
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const q = typeof resolvedSearchParams.q === 'string' ? resolvedSearchParams.q : undefined
  const requestedSort =
    typeof resolvedSearchParams.sort === 'string' ? resolvedSearchParams.sort : undefined
  const sort = requestedSort && VALID_SORTS.has(requestedSort) ? requestedSort : 'new'
  const [communityData, currentUser] = await Promise.all([getCommunity(slug), getCurrentUser()])

  if (!communityData) {
    notFound()
  }

  if (communityData.has_pending_application) {
    return PENDING_APPLICATION_MESSAGE
  }

  const nextPageParams = { limit: 25, sort, ...(q ? { q } : {}) }
  const postsDataResult = await getCommunityPosts(slug, { searchParams: nextPageParams }).catch(
    error => {
      const message = getListSearchErrorMessage(error)
      if (!message) throw error
      return { error: message }
    },
  )
  const hasSearchError = isListSearchErrorResult(postsDataResult)
  const searchError = hasSearchError ? postsDataResult.error : null
  const postsData = hasSearchError ? null : postsDataResult

  const { community } = communityData
  const membership = communityData.membership
  const canCreatePost =
    community.archived_at == null && membership != null && membership.removed_at == null
  const breadcrumbItems = buildBreadcrumbsForPath(communityHref(community), {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [
      { name: 'Communities', path: '/communities' },
      { name: community.name, path: communityHref(community) },
    ],
  })

  return (
    <>
      <AnonymousStructuredDataScript
        data={createCommunityPageSchema({
          name: community.name,
          description: community.markdown ? createExcerpt(community.markdown) : undefined,
          path: communityHref(community),
        })}
      />
      {breadcrumbItems.length > 0 && (
        <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems)} />
      )}
      <div className='space-y-4'>
        <PostFilters
          defaultSort='new'
          enableRelevanceSort={false}
        />
        {postsData ? (
          <CommunityFeed
            data={postsData}
            communitySlug={community.slug}
            canCreatePost={canCreatePost}
            allowReviewPosts={community.allow_review_posts}
            allowDataPointPosts={community.allow_data_point_posts}
            nextPageParams={nextPageParams}
          />
        ) : (
          <ListSearchError
            t={t}
            message={searchError ?? 'Search failed'}
          />
        )}
      </div>
    </>
  )
}
