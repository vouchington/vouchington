import { notFound, redirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { getCurrentUser } from '@/lib/auth/get-current-user'
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

export const dynamic = 'force-dynamic'

export const metadata = createNoIndexMetadata()

export default async function UrlDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect('/login')

  const { id } = await params
  const data = await getUrl(id)
  if (!data) notFound()
  if (!data.can_view_crawl_history) notFound()

  const crawls = await getUrlCrawls(id, { searchParams: { limit: '20' } })

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
          <a
            href={url.url}
            target='_blank'
            rel='nofollow noopener noreferrer'
            className='hover:text-foreground/80'
          >
            {url.url}
          </a>
        </h1>
        <UrlCrawlsPage
          data={crawls}
          urlId={url.id}
        />
      </div>
    </PageWithAside>
  )
}
