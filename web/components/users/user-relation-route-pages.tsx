import { notFound } from 'next/navigation'
import {
  getUserHostnamesCollection,
  getUserPostsCollection,
  getUserRssFeedsCollection,
  getUserTopicsCollection,
  getUserUrlsCollection,
} from '@/lib/api/server'
import { UserHostnameRelationList } from './user-hostname-relation-list'
import { PaginatedUserPostRelationList } from './paginated-user-post-relation-list'
import { UserTopicList } from './user-topic-list'
import { UserUrlRelationList } from './user-url-relation-list'
import { USER_RELATION_ACTIONS } from './user-relation-actions'
import { getOwnerRelationAction } from './user-relation-owner-action'
import type { RelationManagementActionConfig } from './relation-management-action'
import { EmptyState } from '@/components/shared/empty-state'
import { RssFeedListItem } from '@/components/sources/rss-feed-list-item'
import { getTranslations } from '@/lib/i18n/get-translations'
export { UserCommunityRelationRoute } from './user-community-relation-route'
export { UserUserRelationRoute } from './user-user-relation-route'
export {
  UserHiddenRssFeedItemsRoute,
  UserSavedRssFeedItemsRoute,
  UserViewedRssFeedItemsRoute,
} from './user-rss-feed-item-routes'
export { UserViewedRssFeedRoute } from './user-rss-feed-route'

export async function UserPostRelationRoute({
  idOrUsername,
  listType,
}: {
  idOrUsername: string
  listType: keyof typeof USER_RELATION_ACTIONS.post
}) {
  const t = await getTranslations()
  const postsData = await getUserPostsCollection(idOrUsername, listType)
  if (!postsData) notFound()

  return (
    <PaginatedUserPostRelationList
      data={postsData}
      endpoint={`/api/v1/users/${encodeURIComponent(idOrUsername)}/posts/${encodeURIComponent(listType)}`}
      emptyTitle={t('extracted.users.userRelationRoutePages.noListtypePosts_995c9d7c', {
        listType,
      })}
      emptyDescription={t(
        'extracted.users.userRelationRoutePages.thereAreNoListtypePostsTo_418299bb',
        { listType },
      )}
      relationAction={await getOwnerRelationAction(
        idOrUsername,
        USER_RELATION_ACTIONS.post[listType],
      )}
    />
  )
}

export async function UserTopicRelationRoute({
  idOrUsername,
  listType,
  emptyTitle,
  emptyDescription,
  relationAction,
}: {
  idOrUsername: string
  listType:
    | 'blocked'
    | 'muted'
    | 'subscribed-posts'
    | 'subscribed-news'
    | 'dismissed-recommendations'
  emptyTitle: string
  emptyDescription: string
  relationAction: RelationManagementActionConfig
}) {
  const topicsData = await getUserTopicsCollection(idOrUsername, listType)
  if (!topicsData) notFound()

  return (
    <UserTopicList
      topics={topicsData.results}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      relationAction={await getOwnerRelationAction(idOrUsername, relationAction)}
    />
  )
}

export async function UserRssFeedRelationRoute({
  idOrUsername,
  listType,
  feedType,
  emptyTitle,
  emptyDescription,
}: {
  idOrUsername: string
  listType: 'subscribed' | 'muted'
  feedType?: 'article' | 'podcast' | 'video' | 'mixed'
  emptyTitle?: string
  emptyDescription?: string
}) {
  const t = await getTranslations()
  const feedsData = await getUserRssFeedsCollection(idOrUsername, listType, { feedType })
  if (!feedsData) notFound()

  const ownerAction = await getOwnerRelationAction(
    idOrUsername,
    USER_RELATION_ACTIONS.rssFeed[listType],
  )

  const bookmarks = feedsData.bookmarks ?? {}
  const topicElections = feedsData.topic_elections ?? {}
  const hostnameElections = feedsData.hostname_elections ?? {}
  const electionVotes = feedsData.election_votes ?? {}

  if (feedsData.results.length === 0) {
    return (
      <EmptyState
        title={
          emptyTitle ??
          t('extracted.users.userRelationRoutePages.noListtypeRssFeeds_de5d4445', { listType })
        }
        description={
          emptyDescription ??
          t('extracted.users.userRelationRoutePages.thereAreNoListtypeRssFeeds_60c7a203', {
            listType,
          })
        }
      />
    )
  }

  return (
    <div className='space-y-4'>
      {feedsData.results.map(feed => (
        <RssFeedListItem
          key={feed.id}
          feed={feed}
          action={ownerAction ? { kind: 'relation', config: ownerAction } : { kind: 'follow' }}
          isFollowing={bookmarks[feed.id]?.follow === true}
          isFollowingTopic={bookmarks[feed.topic.id]?.follow === true}
          hostnameElection={feed.hostname?.id ? hostnameElections[feed.hostname.id] : undefined}
          topicElection={feed.topic ? topicElections[feed.topic.id] : undefined}
          electionVoteChoice={
            feed.topic
              ? (electionVotes[feed.topic.id]?.choice as
                  | import('@/lib/api/client/elections').SentimentChoice
                  | undefined)
              : undefined
          }
        />
      ))}
    </div>
  )
}

export async function UserUrlRelationRoute({ idOrUsername }: { idOrUsername: string }) {
  const t = await getTranslations()
  const urlsData = await getUserUrlsCollection(idOrUsername, 'saved')
  if (!urlsData) notFound()

  return (
    <UserUrlRelationList
      urls={urlsData.results}
      emptyTitle={t('extracted.users.userRelationRoutePages.noSavedLinks_09fc6dec')}
      emptyDescription={t('extracted.users.userRelationRoutePages.thereAreNoSavedLinksTo_812faaf1')}
      relationAction={await getOwnerRelationAction(idOrUsername, USER_RELATION_ACTIONS.url.saved)}
    />
  )
}

export async function UserHostnameRelationRoute({
  idOrUsername,
  listType,
}: {
  idOrUsername: string
  listType: 'blocked' | 'muted'
}) {
  const t = await getTranslations()
  const hostnamesData = await getUserHostnamesCollection(idOrUsername, listType)
  if (!hostnamesData) notFound()

  return (
    <UserHostnameRelationList
      hostnames={hostnamesData.results}
      emptyTitle={t('extracted.users.userRelationRoutePages.noListtypeDomains_77f913d1', {
        listType,
      })}
      emptyDescription={t(
        'extracted.users.userRelationRoutePages.thereAreNoListtypeDomainsTo_2e432993',
        { listType },
      )}
      relationAction={await getOwnerRelationAction(
        idOrUsername,
        USER_RELATION_ACTIONS.domain[listType],
      )}
    />
  )
}
