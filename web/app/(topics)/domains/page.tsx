import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { DomainsSearchForm } from '@/components/domains/domains-search-form'
import { BlockHostnameQuickAdd } from '@/components/domains/block-hostname-quick-add'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getHostnames } from '@/lib/api/server/hostnames'
import { createPageMetadata } from '@/lib/seo/metadata'
import { createBreadcrumbSchema, createCollectionPageSchema } from '@/lib/seo/structured-data'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { PageWithAside } from '@/components/page-with-aside'
import { PageHeader } from '@/components/shared/page-header'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { DomainsListClient } from './domains-list-client'
import { getTranslations } from '@/lib/i18n/get-translations'

export const metadata = createPageMetadata({
  title: 'Domains',
  description: 'Browse trusted domains and their linked RSS feeds on Voucha.',
  path: '/domains',
})

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function DomainsPage({ searchParams }: PageProps) {
  const t = await getTranslations()
  const params = await searchParams
  const query =
    typeof params.q === 'string'
      ? params.q
      : typeof params.query === 'string'
        ? params.query
        : undefined
  const blocked = typeof params.blocked === 'string' ? params.blocked : undefined
  const crawlable = typeof params.crawlable === 'string' ? params.crawlable : undefined

  const [currentUser, baseData] = await Promise.all([
    getCurrentUser(),
    getHostnames({ searchParams: { query } }),
  ])
  const isAdmin = currentUser?.roles.includes('administrator') ?? false

  // Re-fetch with admin filters if the user is an admin and has applied filters
  const data =
    isAdmin && (blocked !== undefined || crawlable !== undefined)
      ? await getHostnames({ searchParams: { query, blocked, crawlable } })
      : baseData

  const breadcrumbItems = buildBreadcrumbsForPath('/domains', {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [{ name: 'Domains', path: '/domains' }],
  })

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-4'>
        <AnonymousStructuredDataScript
          data={createCollectionPageSchema({
            title: 'Domains',
            description: 'Browse trusted domains and their linked RSS feeds on Voucha.',
            path: '/domains',
          })}
        />
        {breadcrumbItems.length > 0 && (
          <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems)} />
        )}
        <Breadcrumbs items={breadcrumbItems} />
        <PageHeader
          title={t('extracted.domains.page.domains_ced67718')}
          description={t('extracted.domains.page.searchDomainsInspectTheLinkedTopic_6a8e3d17')}
        />
        <DomainsSearchForm
          defaultQuery={query}
          isAdmin={isAdmin}
          defaultBlocked={blocked}
          defaultCrawlable={crawlable}
        />
        <BlockHostnameQuickAdd isAdmin={isAdmin} />
        <DomainsListClient
          initialData={data}
          isAdmin={isAdmin}
          signedIn={!!currentUser}
          searchParams={{ query, blocked, crawlable }}
        />
      </div>
    </PageWithAside>
  )
}
