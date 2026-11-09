import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@/components/ui/button'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getTopHashtags, getTopicRecommendations } from '@/lib/api/server/topic-recommendations'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { canCurrentUserSeeDownvotes } from '@/lib/permissions/can-see-downvotes'
import { PageWithAside } from '@/components/page-with-aside'
import { TopicRecommendationFilters } from '@/components/topic-recommendations/topic-recommendation-filters'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getTranslations } from '@/lib/i18n/get-translations'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TopHashtags } from '@/components/topic-recommendations/top-hashtags'
import { ListSearchError } from '@/components/shared/list-search-error'
import type { TopicRecommendationsTable as TopicRecommendationsTableComponent } from '@/components/topic-recommendations/topic-recommendations-table'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = createNoIndexMetadata('New Topic Recommendations')

const TopicRecommendationsTable = nextDynamic<
  Parameters<typeof TopicRecommendationsTableComponent>[0]
>(() =>
  import('@/components/topic-recommendations/topic-recommendations-table').then(
    mod => mod.TopicRecommendationsTable,
  ),
)

interface TopicRecommendationsPageProps {
  searchParams: Promise<{
    q?: string | string[]
    status?: string | string[]
    tab?: string | string[]
    after?: string | string[]
  }>
}

export default async function TopicRecommendationsPage({
  searchParams,
}: TopicRecommendationsPageProps) {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  if (!currentUser || !Array.isArray(currentUser.roles)) redirect('/login')
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q : undefined
  const after = typeof params.after === 'string' ? params.after : undefined
  const rawStatus = typeof params.status === 'string' ? params.status : undefined
  const status =
    rawStatus === 'pending' || rawStatus === 'approved' || rawStatus === 'rejected'
      ? rawStatus
      : undefined
  const tab = params.tab === 'hashtags' ? 'hashtags' : 'recommendations'

  const [recommendationsResult, topHashtagsResult] = await Promise.allSettled([
    getTopicRecommendations({
      searchParams: {
        limit: 50,
        q,
        status,
        after,
      },
    }),
    getTopHashtags({ searchParams: { limit: 25 } }),
  ])
  const data = recommendationsResult.status === 'fulfilled' ? recommendationsResult.value : null
  const topHashtags = topHashtagsResult.status === 'fulfilled' ? topHashtagsResult.value : null
  const loadErrorMessage = t('extracted.app.error.somethingWentWrong_ab827e3f')

  const breadcrumbItems = buildBreadcrumbsForPath('/topic-recommendations', {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ name: 'New Topic Recommendations', path: '/topic-recommendations' }],
  })

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-4'>
        <Breadcrumbs items={breadcrumbItems} />

        <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
          <div>
            <h1
              className='text-3xl font-semibold tracking-tight'
              data-pw='topic-recommendations-heading'
            >
              {t('extracted.topicRecommendations.page.newTopicRecommendations_a28b10d9')}
            </h1>
            <p className='mt-2 max-w-2xl text-sm text-muted-foreground'>
              {t(
                'extracted.topicRecommendations.page.suggestMissingTopicsVotePendingRequests_9ca37403',
              )}
            </p>
          </div>
          <Button asChild>
            <Link
              href='/topic-recommendations/create'
              prefetch={false}
              data-pw='new-topic-recommendation-link'
            >
              {t('extracted.topicRecommendations.page.newRecommendation_0be7eea7')}
            </Link>
          </Button>
        </div>

        <Tabs defaultValue={tab}>
          <TabsList data-pw='topic-recommendations-tabs'>
            <TabsTrigger
              value='recommendations'
              data-pw='topic-recommendations-tab'
            >
              {t('extracted.topicRecommendations.page.newTopicRecommendations_a28b10d9')}
            </TabsTrigger>
            <TabsTrigger
              value='hashtags'
              data-pw='top-hashtags-tab'
            >
              {t('extracted.topicRecommendations.topHashtags.topHashtags_36e57e0f')}
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value='recommendations'
            className='space-y-4'
          >
            {data ? (
              <>
                <TopicRecommendationFilters />
                <TopicRecommendationsTable
                  data={data}
                  isAdmin={currentUser.roles.includes('administrator')}
                  hideDownCount={!canCurrentUserSeeDownvotes(currentUser)}
                />
                {data.page_info.has_next_page && data.page_info.end_cursor && (
                  <Button
                    asChild
                    variant='outline'
                  >
                    <Link
                      href={recommendationsPageUrl(q, status, tab, data.page_info.end_cursor)}
                      prefetch={false}
                    >
                      {t('extracted.admin.adminPagination.next_1ff57a29')}
                    </Link>
                  </Button>
                )}
              </>
            ) : (
              <ListSearchError
                t={t}
                message={loadErrorMessage}
              />
            )}
          </TabsContent>
          <TabsContent value='hashtags'>
            {topHashtags ? (
              <TopHashtags
                initialData={topHashtags}
                isAdmin={currentUser.roles.includes('administrator')}
              />
            ) : (
              <ListSearchError
                t={t}
                message={loadErrorMessage}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PageWithAside>
  )
}

function recommendationsPageUrl(
  q: string | undefined,
  status: string | undefined,
  tab: string,
  after: string,
): string {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (status) params.set('status', status)
  params.set('tab', tab)
  if (after) params.set('after', after)
  const query = params.toString()
  return query ? `/topic-recommendations?${query}` : '/topic-recommendations'
}
