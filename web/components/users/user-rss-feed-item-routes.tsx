import { notFound } from 'next/navigation'
import { getUserRssFeedItemsCollection } from '@/lib/api/server'
import { RssFeedItemModal } from '@/components/rss-feed-items/rss-feed-item-modal'
import { UserRssFeedItemList } from './user-rss-feed-item-list'
import { USER_RELATION_ACTIONS } from './user-relation-actions'
import { getOwnerRelationAction } from './user-relation-owner-action'
import { createUserPathname } from '@/lib/links/entity-href'
import { getTranslations } from '@/lib/i18n/get-translations'

type PageSearchParams = Record<string, string | string[] | undefined>

export async function UserHiddenRssFeedItemsRoute({
  idOrUsername,
  searchParams,
  mediaType,
  showHeading = true,
  modalPathname,
}: {
  idOrUsername: string
  searchParams: PageSearchParams
  mediaType?: 'article' | 'audio' | 'video'
  showHeading?: boolean
  modalPathname?: string
}) {
  const t = await getTranslations()
  const itemsData = await getUserRssFeedItemsCollection(idOrUsername, 'hidden', { mediaType })
  if (!itemsData) notFound()

  return (
    <>
      {showHeading && (
        <h1 className='sr-only'>
          {t('extracted.users.userRssFeedItemRoutes.hiddenRssItems_28d66515')}
        </h1>
      )}
      <UserRssFeedItemList
        items={itemsData.results}
        emptyTitle='No hidden RSS items'
        emptyDescription='There are no hidden RSS feed items to show.'
        thumbnailUrls={itemsData.rss_feed_item_thumbnail_url}
        embeds={itemsData.rss_feed_item_embeds}
        relationAction={await getOwnerRelationAction(
          idOrUsername,
          USER_RELATION_ACTIONS.rssFeedItem.hidden,
        )}
      >
        <RssFeedItemModal
          pathname={modalPathname ?? createUserPathname(idOrUsername, '/rss-feed-items/hidden')}
          searchParams={searchParams}
        />
      </UserRssFeedItemList>
    </>
  )
}

export async function UserSavedRssFeedItemsRoute({
  idOrUsername,
  searchParams,
  mediaType,
  modalPathname,
}: {
  idOrUsername: string
  searchParams: PageSearchParams
  mediaType?: 'article' | 'audio' | 'video'
  modalPathname?: string
}) {
  const itemsData = await getUserRssFeedItemsCollection(idOrUsername, 'saved', { mediaType })
  if (!itemsData) notFound()

  return (
    <UserRssFeedItemList
      items={itemsData.results}
      emptyTitle='No saved RSS items'
      emptyDescription='There are no saved RSS feed items to show.'
      thumbnailUrls={itemsData.rss_feed_item_thumbnail_url}
      embeds={itemsData.rss_feed_item_embeds}
      relationAction={await getOwnerRelationAction(
        idOrUsername,
        USER_RELATION_ACTIONS.rssFeedItem.saved,
      )}
    >
      <RssFeedItemModal
        pathname={modalPathname ?? createUserPathname(idOrUsername, '/rss-feed-items/saved')}
        searchParams={searchParams}
      />
    </UserRssFeedItemList>
  )
}

export async function UserViewedRssFeedItemsRoute({
  idOrUsername,
  searchParams,
  mediaType,
  modalPathname,
}: {
  idOrUsername: string
  searchParams: PageSearchParams
  mediaType?: 'article' | 'audio' | 'video'
  modalPathname?: string
}) {
  const itemsData = await getUserRssFeedItemsCollection(idOrUsername, 'viewed', { mediaType })
  if (!itemsData) notFound()

  return (
    <UserRssFeedItemList
      items={itemsData.results}
      emptyTitle='No viewed RSS items'
      emptyDescription='There are no viewed RSS feed items to show.'
      thumbnailUrls={itemsData.rss_feed_item_thumbnail_url}
      embeds={itemsData.rss_feed_item_embeds}
    >
      <RssFeedItemModal
        pathname={modalPathname ?? createUserPathname(idOrUsername, '/rss-feed-items/viewed')}
        searchParams={searchParams}
      />
    </UserRssFeedItemList>
  )
}
