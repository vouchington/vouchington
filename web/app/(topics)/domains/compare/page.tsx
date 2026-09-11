import Link from 'next/link'
import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { DomainTrustBadge } from '@/components/domains/domain-trust-badge'
import { getHostnamesCompare } from '@/lib/api/server/hostnames'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { createPageMetadata } from '@/lib/seo/metadata'
import { createBreadcrumbSchema } from '@/lib/seo/structured-data'
import { domainHref, topicHref } from '@/lib/links/entity-href'
import { PageWithAside } from '@/components/page-with-aside'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export const metadata: Metadata = createPageMetadata({
  title: 'Compare Domains',
  path: '/domains/compare',
})

export default async function DomainsComparePage({ searchParams }: PageProps) {
  const t = await getTranslations()
  const params = await searchParams
  const idsParam = typeof params.ids === 'string' ? params.ids : ''
  const ids = idsParam
    ? [...new Set(idsParam.split(',').flatMap(id => (id.trim() ? [id.trim()] : [])))].slice(0, 10)
    : []

  const [currentUser, compareData] = await Promise.all([
    getCurrentUser(),
    ids.length > 0 ? getHostnamesCompare(ids) : Promise.resolve(null),
  ])
  const validDomains = compareData ? Object.values(compareData.hostnames) : []

  const breadcrumbItems = buildBreadcrumbsForPath('/domains/compare', {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: [
      { name: 'Domains', path: '/domains' },
      { name: 'Compare', path: '/domains/compare' },
    ],
  })

  return (
    <PageWithAside showFooter={false}>
      <div className='space-y-4'>
        {breadcrumbItems.length > 0 && (
          <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems)} />
        )}
        <Breadcrumbs items={breadcrumbItems} />
        <div>
          <h1
            className='text-3xl font-bold'
            data-pw='domains-compare-heading'
          >
            {t('extracted.compare.page.compareDomains_77153ba7')}
          </h1>
          <p className='mt-2 text-muted-foreground'>
            {t('extracted.compare.page.sideBySideComparisonOfDomain_f2e3a718')}
          </p>
        </div>

        {validDomains.length === 0 ? (
          <div
            className='rounded-md border bg-card p-6 text-center text-muted-foreground'
            data-pw='domains-compare-empty'
          >
            <p>{t('extracted.compare.page.noDomainsToCompare_07c4cc55')}</p>
            <p className='mt-2 text-sm'>
              {t('extracted.compare.page.addDomainIdsOrHostnamesTo_cfa82924')}{' '}
              <code className='rounded bg-muted px-1'>
                {t('extracted.compare.page.idsId1Id2_8043911f')}
              </code>
              .
            </p>
            <Link
              href='/domains'
              prefetch={false}
              className='mt-4 inline-block text-sm text-primary hover:underline'
              data-pw='domains-compare-browse-link'
            >
              {t('extracted.compare.page.browseAllDomains_d4322d19')}
            </Link>
          </div>
        ) : (
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {validDomains.map(hostname => {
              const topic =
                compareData && hostname.topic_id ? compareData.topics[hostname.topic_id] : null
              const hostname_election = compareData
                ? compareData.hostname_elections[hostname.id]
                : null
              const topicPath = topic ? topicHref(topic) : null

              const scoreNet = hostname_election?.votes_score_net ?? 0
              const countUp = hostname_election?.votes_count_up ?? 0
              const countDown = hostname_election?.votes_count_down ?? 0

              return (
                <div
                  key={hostname.id}
                  className='flex flex-col gap-4 rounded-md border bg-card p-4'
                >
                  <div className='space-y-2'>
                    <Link
                      href={domainHref(hostname)}
                      prefetch={false}
                      className='text-lg font-semibold hover:underline'
                    >
                      {hostname.hostname}
                    </Link>
                    <DomainTrustBadge
                      scoreNet={scoreNet}
                      countUp={countUp}
                      countDown={countDown}
                    />
                  </div>

                  <div className='space-y-1 text-sm'>
                    <div className='flex justify-between'>
                      <span className='text-muted-foreground'>
                        {t('extracted.votes.semanticVote.positiveVotes', { count: countUp })}
                      </span>
                      <span className='font-medium text-emerald-600'>+{countUp}</span>
                    </div>
                    <div className='flex justify-between'>
                      <span className='text-muted-foreground'>
                        {t('extracted.votes.semanticVote.negativeVotes', { count: countDown })}
                      </span>
                      <span className='font-medium text-rose-600'>-{countDown}</span>
                    </div>
                    <div className='flex justify-between'>
                      <span className='text-muted-foreground'>
                        {t('extracted.compare.page.totalVotes_e5672da8')}
                      </span>
                      <span className='font-medium'>{countUp + countDown}</span>
                    </div>
                  </div>

                  {topic && topicPath && (
                    <div className='border-t pt-3 text-sm'>
                      <p className='text-muted-foreground'>
                        {t('extracted.compare.page.linkedTopic_cb09512b')}
                      </p>
                      <Link
                        href={topicPath}
                        prefetch={false}
                        className='font-medium hover:underline'
                      >
                        {topic.name}
                      </Link>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </PageWithAside>
  )
}
