import { notFound, permanentRedirect, redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getTranslations } from '@/lib/i18n/get-translations'
import { getUrl, getUrlCrawls } from '@/lib/api/server/urls'
import { createNoIndexMetadata } from '@/lib/seo/metadata'
import { UrlCrawlsPage } from '@/components/urls/url-crawls-page'
import { UrlAdminAside } from '@/components/urls/url-admin-aside'
import { AboutVouchaAside } from '@/components/asides/about-voucha-aside'
import { FollowTopicsAside } from '@/components/asides/follow-topics-aside'
import { TrendingTopicsAside } from '@/components/asides/trending-topics-aside'
import { SequentialAsideSuspense } from '@/components/asides/sequential-aside-suspense'
import { PageWithAside } from '@/components/page-with-aside'
import { domainHref, urlHref } from '@/lib/links/entity-href'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { ExternalLink } from '@/components/ui/external-link'
import { isUUID } from '@ts-shared/utils/validation-core'

export const dynamic = 'force-dynamic'

export const metadata = createNoIndexMetadata()

export default async function UrlDetailPage({ params }: { params: Promise<{ urlValue: string }> }) {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')
  const t = await getTranslations()

  const { urlValue } = await params
  let urlInput: string
  try {
    urlInput = decodeURIComponent(urlValue)
  } catch {
    notFound()
  }
  const data = await getUrl(urlInput)
  if (!data) notFound()
  if (!data.can_view_crawl_history) notFound()
  if (isUUID(urlInput)) permanentRedirect(urlHref(data.url))

  const crawls = await getUrlCrawls(urlInput, { searchParams: { limit: '20' } })

  const { url, can_trigger_crawl, url_type, rss_feed_id } = data

  const urlPath = urlHref(url)
  const breadcrumbs = buildBreadcrumbsForPath(urlPath, {
    isAuthenticated: true,
    tail: [
      ...(url.hostname ? [{ name: 'Domains', path: domainHref(url.hostname) }] : []),
      { name: 'URL', path: urlPath },
    ],
  })

  return (
    <PageWithAside
      aside={
        <>
          <AboutVouchaAside />
          <UrlAdminAside
            t={t}
            url={url}
            canTriggerCrawl={can_trigger_crawl}
            urlType={url_type}
            rssFeedId={rss_feed_id}
          />
          <SequentialAsideSuspense>
            <FollowTopicsAside />
            <TrendingTopicsAside />
          </SequentialAsideSuspense>
        </>
      }
    >
      <div>
        <Breadcrumbs items={breadcrumbs} />
        <h1 className='mb-8 break-all text-xl font-semibold text-foreground sm:text-2xl md:text-3xl'>
          <ExternalLink
            data-pw='url-page-source-link'
            href={url.url}
            className='hover:text-foreground/80'
          >
            {url.url}
          </ExternalLink>
        </h1>
        <UrlCrawlsPage
          data={crawls}
          urlId={url.id}
          url={url.url}
        />
      </div>
    </PageWithAside>
  )
}
