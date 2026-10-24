/**
 * Feed post list page component (Server Component)
 * Fetches post feed data and renders tabs, sub-filters, and list
 */

import { getPostFeed } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { canCurrentUserSeeDownvotes } from '@/lib/permissions/can-see-downvotes'
import { PostList } from '@/components/posts/post-list'
import { PostFilters } from '@/components/posts/post-filters'
import { PostViewToggle } from '@/components/posts/post-view-toggle'
import { ListSearchError } from '@/components/shared/list-search-error'
import { FeedTopSection } from './feed-top-section'
import { FeedPostEmptyState } from './feed-post-empty-state'
import { FEED_PAGE_LIMIT, type PostFeedRouteConfig } from '@/lib/feed-route-configs'
import { getListSearchErrorMessage, isListSearchErrorResult } from '@/lib/api/list-search-error'
import { getTranslations } from '@/lib/i18n/get-translations'

interface FeedPostListPageProps {
  config: PostFeedRouteConfig
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export async function FeedPostListPage({ config, searchParams }: FeedPostListPageProps) {
  const t = await getTranslations()
  const feedSortOptions = [
    {
      label: t('extracted.feed.feedPostListPage.new_18fdd549'),
      value: 'new',
      description: t('extracted.feed.feedPostListPage.sortByMostRecent_20464d27'),
    },
    {
      label: t('extracted.feed.feedPostListPage.hot_0ec53894'),
      value: 'hot',
      description: t('extracted.feed.feedPostListPage.sortByTrendingScore_f85080e3'),
    },
  ]
  const endpoint = `/api/v1/feeds/posts/${config.feedType}`
  const params = searchParams ? await searchParams : {}
  const sort = typeof params.sort === 'string' && params.sort === 'hot' ? 'hot' : 'new'
  const query = typeof params.q === 'string' ? params.q : undefined
  const currentUser = await getCurrentUser()
  const queryParams = {
    limit: FEED_PAGE_LIMIT,
    sort,
    ...(query ? { q: query } : {}),
  }
  const dataResult = await getPostFeed(config.feedType, { searchParams: queryParams }).catch(
    err => {
      const message = getListSearchErrorMessage(err)
      if (!message) throw err
      return { error: message }
    },
  )
  const hasSearchError = isListSearchErrorResult(dataResult)
  const searchError = hasSearchError ? dataResult.error : null
  const data = hasSearchError ? null : dataResult

  const emptyState = (
    <FeedPostEmptyState
      feedType={config.feedType}
      labels={{
        yourFeedIsEmpty: t('extracted.feed.feedPostListPage.yourFeedIsEmpty_2a96dd2d'),
        followTopicsAndPeople: t(
          'extracted.feed.feedPostListPage.followTopicsAndPeopleToSee_99857186',
        ),
        noPostsFromPeople: t('extracted.feed.feedPostListPage.noPostsFromPeopleYouFollow_386b3367'),
        followPeople: t('extracted.feed.feedPostListPage.followPeopleToSeeTheirPosts_87fa9671'),
        noPostsYet: t('extracted.feed.feedPostListPage.noPostsYet_f2bd6770'),
        followSomeTopics: t('extracted.feed.feedPostListPage.followSomeTopicsToSeePosts_75c6faaf'),
        browseTopics: t('extracted.feed.feedPostListPage.browseTopics_58b290ad'),
        findFriends: t('extracted.feed.feedPostListPage.findFriends_d4864039'),
      }}
    />
  )

  return (
    <div className='space-y-4'>
      <FeedTopSection
        category={config.category}
        activeFilterPath={config.path}
        filters={
          <PostFilters
            sortOptions={feedSortOptions}
            defaultSort='new'
            enableRelevanceSort={false}
          />
        }
        viewToggle={<PostViewToggle />}
      />
      {data ? (
        <PostList
          data={data}
          nextPageEndpoint={endpoint}
          nextPageParams={queryParams}
          emptyState={emptyState}
          hideDownCount={!canCurrentUserSeeDownvotes(currentUser)}
        />
      ) : (
        <ListSearchError
          t={t}
          message={searchError ?? t('extracted.feed.feedPostListPage.searchFailed_01ee45e5')}
        />
      )}
    </div>
  )
}
