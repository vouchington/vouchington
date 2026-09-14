import { notFound, redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getUrl, getUrlCrawl } from '@/lib/api/server/urls'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { PageWithAside } from '@/components/page-with-aside'
import { CrawlMetaTags } from '@/components/urls/crawl-meta-tags'
import { createUrlPathname, domainHref, urlHref } from '@/lib/links/entity-href'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { getTranslations } from '@/lib/i18n/get-translations'

export const dynamic = 'force-dynamic'

export const metadata = createNoIndexMetadata()

export default async function CrawlDetailPage({
  params,
}: {
  params: Promise<{ id: string; crawlId: string }>
}) {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const { id, crawlId } = await params

  // Check access via URL detail flags
  const urlData = await getUrl(id)
  if (!urlData) notFound()
  if (!urlData.can_view_crawl_history) notFound()

  const data = await getUrlCrawl(id, crawlId)
  if (!data) notFound()
  const { crawl, og_image_sideload } = data

  const hasMetaData =
    Object.keys(crawl.meta_tags ?? {}).length > 0 || !!crawl.lang || crawl.embed_metadata != null

  const urlPath = urlHref(id)
  const breadcrumbItems = buildBreadcrumbsForPath(urlPath, {
    isAuthenticated: true,
    tail: [
      ...(urlData.url.hostname
        ? [{ name: 'Domains', path: domainHref(urlData.url.hostname) }]
        : []),
      { name: 'URL', path: urlPath },
      { name: 'Crawl', path: createUrlPathname(id, `/crawls/${crawlId}`) },
    ],
  })

  return (
    <PageWithAside showFooter={false}>
      <Breadcrumbs items={breadcrumbItems} />
      <h1 className='mb-8 text-xl font-semibold text-foreground'>
        {t('extracted.crawlid.page.crawlDetails_aa7bec3e')}
      </h1>

      <div className='mb-8 overflow-hidden bg-card shadow-sm dark:shadow-none sm:rounded-lg'>
        <div className='px-4 py-5 sm:px-6'>
          <h2 className='text-lg font-medium leading-6 text-foreground'>
            {t('extracted.crawlid.page.crawlInformation_13f65660')}
          </h2>
        </div>
        <div className='border-t px-4 py-5 sm:px-6'>
          <dl className='grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2'>
            <div>
              <dt className='text-sm font-medium text-muted-foreground'>
                {t('extracted.crawlid.page.statusCode_6bd59553')}
              </dt>
              <dd className='mt-1 text-sm text-foreground'>{crawl.response_status_code}</dd>
            </div>
            <div>
              <dt className='text-sm font-medium text-muted-foreground'>
                {t('extracted.crawlid.page.createdAt_3d443370')}
              </dt>
              <dd
                className='mt-1 text-sm text-foreground'
                suppressHydrationWarning
              >
                {new Date(crawl.created_at).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className='text-sm font-medium text-muted-foreground'>
                {t('extracted.crawlid.page.completedAt_3e10363f')}
              </dt>
              <dd
                className='mt-1 text-sm text-foreground'
                suppressHydrationWarning
              >
                {crawl.completed_at ? new Date(crawl.completed_at).toLocaleString() : 'N/A'}
              </dd>
            </div>
            {crawl.title && (
              <div>
                <dt className='text-sm font-medium text-muted-foreground'>
                  {t('extracted.crawlid.page.title_7e8cd205')}
                </dt>
                <dd className='mt-1 text-sm text-foreground'>{crawl.title}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {hasMetaData && (
        <CrawlMetaTags
          t={t}
          meta={crawl.meta_tags ?? {}}
          lang={crawl.lang ?? null}
          ogImageSideload={og_image_sideload ?? null}
          embedMetadata={crawl.embed_metadata ?? null}
          crawlTitle={crawl.title ?? null}
        />
      )}

      {crawl.markdown && (
        <div className='overflow-hidden bg-card shadow-sm dark:shadow-none sm:rounded-lg'>
          <div className='px-4 py-5 sm:px-6'>
            <h2 className='text-lg font-medium leading-6 text-foreground'>
              {t('extracted.crawlid.page.content_47bd2907')}
            </h2>
          </div>
          <div className='border-t px-4 py-5 sm:px-6'>
            <pre className='whitespace-pre-wrap text-sm text-foreground'>{crawl.markdown}</pre>
          </div>
        </div>
      )}
    </PageWithAside>
  )
}
