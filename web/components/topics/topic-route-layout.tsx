import { headers } from 'next/headers'
import { notFound, permanentRedirect } from 'next/navigation'
import type { MessageKey } from '@ts-shared/ui-messages'
import { getMembership, getTopic } from '@/lib/api/server'
import { getHostnames } from '@/lib/api/server/hostnames'
import { getRssFeeds } from '@/lib/api/server/rss-feeds'
import { createTopicPathname, topicHref } from '@/lib/links/entity-href'
import { getTopicTypeSlug, topicTypes, type TopicTypes } from '@/types/topics'
import { topicRouteConfigs } from '@/lib/route-configs'
import { getTopicDisplayName } from '@/lib/topics/display-name'
import { TopicDetailLayout } from './topic-detail-layout'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { feedTypeNav } from '@/lib/navigation/intents'
import { SetNavIntent } from '@/lib/navigation/intents/nav-intent-provider'
import { RssFeedViewTracker } from '@/components/sources/rss-feed-view-tracker'
import TopicFollowContext from './topic-follow-context'
import { PageWithAside } from '@/components/page-with-aside'
import { TopicRouteAsides } from './topic-route-asides'
import { getTranslations } from '@/lib/i18n/get-translations'
import { getFediverseInstance } from '@/lib/api/server/fediverse'
import { canCurrentUserViewCrawlHistory } from '@/lib/permissions/can-view-crawl-history'

interface TopicRouteLayoutProps {
  id: string
  topicType: TopicTypes
  children: React.ReactNode
}
export async function TopicRouteLayout({ id, topicType, children }: TopicRouteLayoutProps) {
  const t = await getTranslations()
  const topicData = await getTopic(id)
  if (!topicData) {
    notFound()
  }

  const topic = topicData.topic
  if (topicData.topic_redirect) {
    const headersList = await headers()
    const pathname = headersList.get('x-pathname') ?? ''
    const search = headersList.get('x-search') ?? ''
    const sourcePath = createTopicPathname({
      topic_type: topicData.topic_redirect.source_topic_type,
      id,
    })
    const suffix = pathname.startsWith(`${sourcePath}/`) ? pathname.slice(sourcePath.length) : ''
    const queryString = search ? `?${search}` : ''
    permanentRedirect(`${topicHref(topic)}${suffix}${queryString}`)
  }
  if (topic.topic_type !== topicType) {
    notFound()
  }
  const [fediverseInstanceData, currentUser] = await Promise.all([
    topicType === 'fediverse_instance' ? getFediverseInstance(topic.id) : Promise.resolve(null),
    getCurrentUser(),
  ])
  const membership =
    topicType === 'rss_feed' && currentUser && !currentUser.roles.includes('administrator')
      ? (await getMembership()).membership
      : null
  if (topicType === 'fediverse_instance' && !fediverseInstanceData) {
    notFound()
  }
  const isAdmin = currentUser?.roles.includes('administrator') ?? false
  const isFollowing = topicData.bookmarks?.[topic.id]?.follow
  const [rssFeeds, hostnames, ownRssFeedResult] = await Promise.all([
    getRssFeeds({
      searchParams: { topic: topic.id, include_descendants: true, enabled: true },
    }),
    getHostnames({
      searchParams: { topic: topic.id, include_descendants: true },
    }),
    topicType === 'rss_feed'
      ? getRssFeeds({ searchParams: { topic: topic.id } })
      : Promise.resolve(null),
  ])
  const firstRssFeed = rssFeeds.results[0] ?? null
  const ownRssFeed = ownRssFeedResult?.results[0] ?? firstRssFeed
  const topicDisplayName = getTopicDisplayName(topic, {
    feedType: ownRssFeed?.topic?.id === topic.id ? ownRssFeed.feed_type : undefined,
  })
  const isFollowingRssFeed = firstRssFeed
    ? (rssFeeds.bookmarks?.[firstRssFeed.id]?.follow ?? false)
    : undefined
  const isMuted = topicData.bookmarks?.[topic.id]?.mute
  const slugPlural = topicTypes[topicType]?.slugPlural ?? topicType
  const topicRouteConfig = (topicRouteConfigs as Record<string, { title: MessageKey } | undefined>)[
    slugPlural
  ]
  const topicTypeTitle = topicRouteConfig
    ? t(topicRouteConfig.title)
    : slugPlural.charAt(0).toUpperCase() + slugPlural.slice(1)
  const topicPath = topicHref({ topic_type: topicType, slug: topic.slug, id: topic.id })
  const rssNav =
    topicType === 'rss_feed'
      ? feedTypeNav(ownRssFeed?.feed_type, ownRssFeed?.is_discoverable)
      : null
  const intentOverridePath = `/${getTopicTypeSlug(topicType)}/${id}`
  const sourceRssFeedId = topicType === 'rss_feed' ? ownRssFeed?.id : undefined
  const breadcrumbItems = buildBreadcrumbsForPath(topicPath, {
    intentCrumbOverride: rssNav
      ? { name: t(rssNav.listTitleKey), path: rssNav.listPath }
      : undefined,
    isAuthenticated: !!currentUser,
    userRoles: currentUser?.roles ?? [],
    tail: rssNav
      ? [{ name: topicDisplayName, path: topicPath }]
      : [
          { name: topicTypeTitle, path: topicRouteConfig ? `/${slugPlural}` : '/topics' },
          { name: topicDisplayName, path: topicPath },
        ],
  })
  return (
    <PageWithAside
      aside={
        <TopicRouteAsides
          t={t}
          topicData={topicData}
          topicDisplayName={topicDisplayName}
          isAuthenticated={!!currentUser}
          isMuted={isMuted}
          firstRssFeed={firstRssFeed}
          rssFeeds={rssFeeds}
          hostnames={hostnames}
        />
      }
    >
      <Breadcrumbs items={breadcrumbItems} />
      {rssNav && (
        <SetNavIntent
          intent={rssNav.intent}
          pathname={intentOverridePath}
        />
      )}
      {sourceRssFeedId && <RssFeedViewTracker rssFeedId={sourceRssFeedId} />}
      <TopicDetailLayout
        topic={topic}
        metrics={topicData.topic_metrics}
        election={topicData.topic_election}
        electionVote={topicData.election_vote}
        topicType={getTopicTypeSlug(topicType)}
        isFollowing={isFollowing}
        isAuthenticated={!!currentUser}
        isAdmin={isAdmin}
        canViewCrawlHistory={
          topicType === 'rss_feed' && canCurrentUserViewCrawlHistory(currentUser, membership)
        }
        rssFeedId={firstRssFeed?.id}
        isFollowingRssFeed={isFollowingRssFeed}
        displayName={topicDisplayName}
        fediverseInstance={fediverseInstanceData?.fediverse_instance}
        hostnameElection={fediverseInstanceData?.hostname_election}
      >
        {currentUser && <TopicFollowContext id={topic.id} />}
        {children}
      </TopicDetailLayout>
    </PageWithAside>
  )
}
