/**
 * Post list page component (Server Component)
 * Fetches posts data and renders filters, sort, and list
 */

import Link from 'next/link'
import { getPosts } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { canCurrentUserSeeDownvotes } from '@/lib/permissions/can-see-downvotes'
import { PostFilters } from './post-filters'
import { PostList } from './post-list'
import { PostViewToggle } from './post-view-toggle'
import type { PostRouteConfig } from '@/lib/route-configs'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { createBreadcrumbSchema, createCollectionPageSchema } from '@/lib/seo/structured-data'
import { EmptyState } from '@/components/shared/empty-state'
import { ListSearchError } from '@/components/shared/list-search-error'
import { getListSearchErrorMessage, isListSearchErrorResult } from '@/lib/api/list-search-error'
import { getTranslations } from '@/lib/i18n/get-translations'
import { Button } from '@/components/ui/button'
import { PageWithAside } from '@/components/page-with-aside'
import { PostsDiscoveryAside } from '@/components/asides/posts-discovery-aside'
import { PostListTopSection } from './post-list-top-section'
import { joinSearchParamValues } from '@/lib/search-param-values'

const createRoutes: Partial<Record<string, string>> = {
  reviews: '/reviews/create',
  discussions: '/discussions/create',
  'data-points': '/data-points/create',
}

function buildEmptyState(
  config: PostRouteConfig,
  isAuthenticated: boolean,
  hasSearch: boolean,
): React.ReactNode {
  if (hasSearch) {
    return (
      <EmptyState
        title='No results found'
        description='Try adjusting your search or filters'
        icon='search'
      />
    )
  }

  const createPath = createRoutes[config.pluralPath]
  const singularLabel = config.singularPath.replace(/-/g, ' ')

  if (createPath && isAuthenticated) {
    return (
      <EmptyState
        title={`No ${config.pluralPath.replace(/-/g, ' ')} yet`}
        description={`Be the first to share a ${singularLabel}.`}
        icon='pen-line'
      >
        <Button
          asChild
          size='sm'
        >
          <Link
            href={createPath}
            prefetch={false}
          >
            Create {singularLabel}
          </Link>
        </Button>
      </EmptyState>
    )
  }

  if (createPath && !isAuthenticated) {
    return (
      <EmptyState
        title={`No ${config.pluralPath.replace(/-/g, ' ')} yet`}
        description={`Sign in to share a ${singularLabel}.`}
        icon='pen-line'
      >
        <Button
          asChild
          size='sm'
          variant='outline'
        >
          <Link
            href='/login'
            prefetch={false}
          >
            Sign in
          </Link>
        </Button>
      </EmptyState>
    )
  }

  return (
    <EmptyState
      title={`No ${config.pluralPath.replace(/-/g, ' ')} found`}
      description='Try adjusting your search or filters'
    />
  )
}

interface PostListPageProps {
  config: PostRouteConfig
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function PostListPage({ config, searchParams }: PostListPageProps) {
  const t = await getTranslations()
  const params = await searchParams

  // Extract search params
  const q = typeof params.q === 'string' ? params.q : undefined
  const topics = joinSearchParamValues(params.topics)
  const sort = typeof params.sort === 'string' ? params.sort : 'hot'
  const postTypes = config.postTypes?.join(',')
  const queryParams = {
    ...(q ? { q } : {}),
    ...(topics ? { topics } : {}),
    ...(postTypes ? { post_types: postTypes } : {}),
    sort,
    limit: 25,
  }

  // Fetch page 1 server-side; subsequent pages are fetched client-side by PostList
  const [dataResult, currentUser] = await Promise.all([
    getPosts({ searchParams: queryParams }).catch(error => {
      const message = getListSearchErrorMessage(error)
      if (!message) throw error
      return { error: message }
    }),
    getCurrentUser(),
  ])
  const hasSearchError = isListSearchErrorResult(dataResult)
  const searchError = hasSearchError ? dataResult.error : null
  const data = hasSearchError ? null : dataResult

  const emptyState = buildEmptyState(config, !!currentUser, !!q || !!topics)

  const breadcrumbItems = buildBreadcrumbsForPath(`/${config.pluralPath}`, {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ nameKey: config.title, path: `/${config.pluralPath}` }],
  })

  return (
    <PageWithAside aside={PostsDiscoveryAside}>
      <div className='space-y-4'>
        <AnonymousStructuredDataScript
          data={createCollectionPageSchema({
            title: t(config.title),
            description: t(config.description),
            path: `/${config.pluralPath}`,
          })}
        />
        {breadcrumbItems.length > 0 && (
          <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems, t)} />
        )}

        <PostListTopSection
          config={config}
          filters={<PostFilters defaultSort='hot' />}
          viewToggle={<PostViewToggle />}
          isAuthenticated={!!currentUser}
          userRoles={currentUser?.roles ?? []}
        />

        {data ? (
          <PostList
            data={data}
            nextPageEndpoint='/api/v1/posts'
            nextPageParams={queryParams}
            emptyState={emptyState}
            hideDownCount={!canCurrentUserSeeDownvotes(currentUser)}
          />
        ) : (
          <ListSearchError
            t={t}
            message={searchError ?? 'Search failed'}
          />
        )}
      </div>
    </PageWithAside>
  )
}
