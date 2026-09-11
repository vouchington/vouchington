export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCommunities } from '@/lib/api/server'
import { ApiError } from '@/lib/api/error'
import type { CommunitiesSearchResponseBody } from '@/types/api-responses'
import { CommunityFilters } from '@/components/communities/community-filters'
import { CommunityList } from '@/components/communities/community-list'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { createPageMetadata } from '@/lib/seo/metadata'
import {
  createBreadcrumbSchema,
  createCollectionPageSchema,
  createItemListSchema,
} from '@/lib/seo/structured-data'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { AboutVouchaAside } from '@/components/asides/about-voucha-aside'
import { PageWithAside } from '@/components/page-with-aside'
import { PageHeader } from '@/components/shared/page-header'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { communityHref } from '@/lib/links/entity-href'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata = createPageMetadata({
  title: 'Communities',
  description:
    'Discover and join communities on Voucha. Find topic-focused spaces for discussion and collaboration.',
  path: '/communities',
})

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function buildCommunityItemListItems(
  data: CommunitiesSearchResponseBody | undefined,
): { name: string; url: string }[] {
  return (data?.results ?? [])
    .slice(0, 10)
    .reduce<{ name: string; url: string }[]>((acc, result) => {
      const community = data?.communities?.[result.id]
      if (community !== undefined) acc.push({ name: community.name, url: communityHref(community) })
      return acc
    }, [])
}

const VALID_SORTS = new Set(['members', 'name'])

function buildNormalizedSortRedirectPath(
  sortParam: string | undefined,
  q: string | undefined,
): string | null {
  if (!sortParam || VALID_SORTS.has(sortParam)) return null
  const clean = new URLSearchParams()
  if (q) clean.set('q', q)
  const qs = clean.toString()
  return `/communities${qs ? `?${qs}` : ''}`
}

export default async function CommunitiesPage({ searchParams }: PageProps) {
  const t = await getTranslations()
  const [params, currentUser] = await Promise.all([searchParams, getCurrentUser()])
  const q = typeof params.q === 'string' ? params.q : undefined
  const sortParam = typeof params.sort === 'string' ? params.sort : undefined
  const after = typeof params.after === 'string' ? params.after : undefined
  const hasListItems = params.has_list_items === 'true' ? true : undefined

  const redirectPath = buildNormalizedSortRedirectPath(sortParam, q)
  if (redirectPath) redirect(redirectPath)

  const sort = sortParam ?? 'members'

  const queryParams = {
    q,
    sort,
    ...(after ? { after } : {}),
    ...(hasListItems ? { has_list_items: true } : {}),
  }

  let data: CommunitiesSearchResponseBody | undefined = undefined
  let searchError: string | undefined = undefined
  try {
    data = await getCommunities({ searchParams: queryParams })
  } catch (error) {
    if (error instanceof ApiError && (error.status === 400 || error.status === 422)) {
      const errorData = error.data as Record<string, unknown> | undefined
      searchError =
        typeof errorData?.error === 'string'
          ? errorData.error
          : typeof errorData?.message === 'string'
            ? errorData.message
            : t('extracted.communities.page.invalidSearchQuery_7a4e91cd')
    } else {
      throw error
    }
  }

  const breadcrumbItems = buildBreadcrumbsForPath('/communities', {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ name: 'Communities', path: '/communities' }],
  })

  const communityItemListItems = buildCommunityItemListItems(data)

  return (
    <PageWithAside aside={AboutVouchaAside}>
      <div className='space-y-4'>
        <AnonymousStructuredDataScript
          data={createCollectionPageSchema({
            title: 'Communities',
            description:
              'Discover and join communities on Voucha. Find topic-focused spaces for discussion.',
            path: '/communities',
          })}
        />
        {breadcrumbItems.length > 0 && (
          <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems)} />
        )}
        <AnonymousStructuredDataScript
          data={createItemListSchema(communityItemListItems, 'Communities')}
        />
        <Breadcrumbs items={breadcrumbItems} />
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <PageHeader
            title={t('extracted.communities.page.communities_c864f329')}
            description={t('extracted.communities.page.discoverAndJoinCommunities_3e08c1f2')}
            dataPw='communities-page-heading'
          />
          {currentUser && (
            <Button
              asChild
              className='shrink-0'
            >
              <Link
                href='/communities/create'
                prefetch={false}
                data-pw='communities-create-cta'
              >
                {t('extracted.communities.page.createCommunity_62cdc055')}
              </Link>
            </Button>
          )}
        </div>
        <CommunityFilters />
        {searchError ? (
          <p className='text-sm text-destructive'>{searchError}</p>
        ) : (
          <CommunityList
            data={data!}
            nextPageEndpoint='/api/v1/communities'
            nextPageParams={{
              sort,
              ...(q ? { q } : {}),
              ...(hasListItems ? { has_list_items: true } : {}),
            }}
          />
        )}
      </div>
    </PageWithAside>
  )
}
