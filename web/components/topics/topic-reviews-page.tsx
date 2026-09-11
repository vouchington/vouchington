import { getPosts } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { PostList } from '@/components/posts/post-list'
import { PostFilters } from '@/components/posts/post-filters'
import { canCurrentUserSeeDownvotes } from '@/lib/permissions/can-see-downvotes'
import { ListSearchError } from '@/components/shared/list-search-error'
import { getListSearchErrorMessage, isListSearchErrorResult } from '@/lib/api/list-search-error'
import { getTranslations } from '@/lib/i18n/get-translations'
import { getTopicPostSort, TOPIC_POST_SORT_OPTIONS } from './topic-post-sort'

export async function TopicReviewsPage({
  id,
  searchParams,
}: {
  id: string
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const t = await getTranslations()
  const currentUser = await getCurrentUser()
  const sort = getTopicPostSort(searchParams?.sort, currentUser)
  const q = typeof searchParams?.q === 'string' ? searchParams.q : undefined
  const hideDownCount = !canCurrentUserSeeDownvotes(currentUser)
  const queryParams = {
    review_topic: id,
    post_types: 'review',
    ...(q ? { q } : {}),
    sort,
    limit: 25,
  }
  const dataResult = await getPosts({ searchParams: queryParams }).catch(error => {
    const message = getListSearchErrorMessage(error)
    if (!message) throw error
    return { error: message }
  })
  const hasSearchError = isListSearchErrorResult(dataResult)

  return (
    <div className='space-y-4'>
      <PostFilters
        sortOptions={TOPIC_POST_SORT_OPTIONS}
        defaultSort={sort}
      />
      {hasSearchError ? (
        <ListSearchError
          t={t}
          message={dataResult.error}
        />
      ) : (
        <PostList
          data={dataResult}
          nextPageEndpoint='/api/v1/posts'
          nextPageParams={queryParams}
          filterReviewTopicIds={[id]}
          hideDownCount={hideDownCount}
        />
      )}
    </div>
  )
}
