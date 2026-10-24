/**
 * Feed referral links list page component (Server Component)
 * Fetches referral links from followed/mutual users and renders the feed
 */
import { getReferralLinksFeed } from '@/lib/api/server/feeds'
import { FeedTopSection } from './feed-top-section'
import { FeedReferralLinksEmptyState } from './feed-referral-links-empty-state'
import { ReferralLinkFeedList } from './referral-link-feed-list'
import { ListSearchError } from '@/components/shared/list-search-error'
import { FEED_PAGE_LIMIT, type ReferralLinksFeedRouteConfig } from '@/lib/feed-route-configs'
import { getListSearchErrorMessage, isListSearchErrorResult } from '@/lib/api/list-search-error'
import { getTranslations } from '@/lib/i18n/get-translations'

type FeedReferralLinksListPageProps = {
  config: ReferralLinksFeedRouteConfig
}

export async function FeedReferralLinksListPage({ config }: FeedReferralLinksListPageProps) {
  const t = await getTranslations()
  const endpoint = `/api/v1/feeds/referral_links/${config.feedType}`
  const queryParams = { limit: FEED_PAGE_LIMIT }
  const dataResult = await getReferralLinksFeed(config.feedType, {
    searchParams: queryParams,
  }).catch(err => {
    const message = getListSearchErrorMessage(err)
    if (!message) throw err
    return { error: message }
  })
  const hasSearchError = isListSearchErrorResult(dataResult)
  const searchError = hasSearchError ? dataResult.error : null
  const data = hasSearchError ? null : dataResult

  const emptyState = (
    <FeedReferralLinksEmptyState
      title={t('extracted.feed.feedReferralLinksListPage.noReferralLinksYet_17b1386e')}
      description={t(
        'extracted.feed.feedReferralLinksListPage.followFriendsToSeeTheirReferral_3297ffe2',
      )}
      findFriendsLabel={t('extracted.feed.feedReferralLinksListPage.findFriends_d4864039')}
      shareYourLinksLabel={t('extracted.feed.feedReferralLinksListPage.shareYourLinks_282c0fc6')}
    />
  )

  return (
    <div className='space-y-4'>
      <FeedTopSection
        category={config.category}
        activeFilterPath={config.path}
        filters={null}
        viewToggle={null}
      />
      {searchError ? (
        <ListSearchError
          t={t}
          message={searchError}
        />
      ) : data ? (
        <ReferralLinkFeedList
          data={data}
          nextPageEndpoint={endpoint}
          nextPageParams={queryParams}
          emptyState={emptyState}
        />
      ) : null}
    </div>
  )
}
