import nextDynamic from 'next/dynamic'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { AnonymousStructuredDataScript } from '@/components/seo/anonymous-structured-data-script'
import { HostnameVouchDisavowVote } from '@/components/hostnames/hostname-vouch-disavow-vote'
import { DomainTrustBadge } from '@/components/domains/domain-trust-badge'
import DomainModerationPanel from '@/components/domains/domain-moderation-panel'
import DomainCrawlersPanel from '@/components/domains/domain-crawlers-panel'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getHostname } from '@/lib/api/server/hostnames'
import { createNoIndexMetadata, createPageMetadata } from '@/lib/seo/metadata'
import { createBreadcrumbSchema, type BreadcrumbNavItem } from '@/lib/seo/structured-data'
import { PageWithAside } from '@/components/page-with-aside'
import { DomainOverview } from './domain-overview'
import { TopicLabel } from '@/components/topics/topic-label'
import { domainHref, topicHref } from '@/lib/links/entity-href'
import { topicTypes } from '@/types/topics'
import { topicRouteConfigs, type TopicRouteConfig } from '@/lib/route-configs'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const DomainDetailTabs = nextDynamic(() =>
  import('@/components/domains/domain-detail-tabs').then(m => ({ default: m.DomainDetailTabs })),
)

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const DomainActionsAside = nextDynamic(() =>
  import('@/components/domains/domain-actions-aside').then(m => ({
    default: m.DomainActionsAside,
  })),
)

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const data = await getHostname(id)
  if (!data) return createNoIndexMetadata()

  return createPageMetadata({
    title: data.hostname.hostname,
    description: `Authority and source details for ${data.hostname.hostname}.`,
    path: domainHref(data.hostname),
  })
}

export default async function DomainDetailPage({ params }: PageProps) {
  const { id } = await params
  const [currentUser, data] = await Promise.all([getCurrentUser(), getHostname(id)])

  if (!data) notFound()

  const { hostname, topic, hostname_election, election_vote, top_urls, rss_feeds, crawlers } = data
  const isAdmin = currentUser?.roles.includes('administrator') ?? false

  const breadcrumbTail: BreadcrumbNavItem[] = topic
    ? (() => {
        const slugPlural = topicTypes[topic.topic_type]?.slugPlural ?? topic.topic_type
        const topicRouteConfig = (
          topicRouteConfigs as Record<string, TopicRouteConfig | undefined>
        )[slugPlural]
        const topicTypeCrumb: BreadcrumbNavItem = topicRouteConfig
          ? { nameKey: topicRouteConfig.title, path: `/${slugPlural}` }
          : { name: slugPlural.charAt(0).toUpperCase() + slugPlural.slice(1), path: '/topics' }
        return [
          topicTypeCrumb,
          { name: topic.name, path: topicHref(topic) },
          { name: hostname.hostname, path: domainHref(hostname) },
        ]
      })()
    : [
        { name: 'Domains', path: '/domains' },
        { name: hostname.hostname, path: domainHref(hostname) },
      ]

  const breadcrumbItems = buildBreadcrumbsForPath(domainHref(hostname), {
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: breadcrumbTail,
  })

  return (
    <PageWithAside
      showFooter={false}
      aside={currentUser ? <DomainActionsAside hostnameId={hostname.id} /> : undefined}
    >
      <div className='space-y-4'>
        {breadcrumbItems.length > 0 && (
          <AnonymousStructuredDataScript data={createBreadcrumbSchema(breadcrumbItems)} />
        )}
        <Breadcrumbs items={breadcrumbItems} />
        <div className='rounded-md border bg-card p-4'>
          <div className='space-y-2'>
            <div className='flex flex-wrap items-center gap-3'>
              <h1
                className='text-2xl font-bold tracking-tight'
                data-pw='domain-detail-heading'
              >
                {hostname.hostname}
              </h1>
              {hostname_election && (
                <DomainTrustBadge
                  scoreNet={hostname_election.votes_score_net ?? 0}
                  countUp={hostname_election.votes_count_up ?? 0}
                  countDown={hostname_election.votes_count_down ?? 0}
                  hostname={hostname.hostname}
                />
              )}
            </div>
            {topic && <TopicLabel topic={topic} />}
            {hostname_election && (
              <div className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
                <HostnameVouchDisavowVote
                  electionId={hostname_election.id}
                  countUp={hostname_election.votes_count_up ?? 0}
                  countDown={hostname_election.votes_count_down ?? 0}
                  existingVoteChoice={
                    election_vote?.choice as
                      | import('@/lib/api/client/elections').SentimentChoice
                      | undefined
                  }
                  signedOut={!currentUser}
                />
              </div>
            )}
          </div>
        </div>
        {isAdmin ? (
          <DomainDetailTabs>
            <DomainOverview
              rss_feeds={rss_feeds}
              top_urls={top_urls}
            />
            <DomainModerationPanel hostname={hostname} />
            <DomainCrawlersPanel crawlers={crawlers ?? []} />
          </DomainDetailTabs>
        ) : (
          <DomainOverview
            rss_feeds={rss_feeds}
            top_urls={top_urls}
          />
        )}
      </div>
    </PageWithAside>
  )
}
