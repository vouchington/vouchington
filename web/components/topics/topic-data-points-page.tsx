import { getPosts } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { PostList } from '@/components/posts/post-list'
import { PostFilters } from '@/components/posts/post-filters'
import { canCurrentUserSeeDownvotes } from '@/lib/permissions/can-see-downvotes'
import { ListSearchError } from '@/components/shared/list-search-error'
import { getListSearchErrorMessage, isListSearchErrorResult } from '@/lib/api/list-search-error'
import { getTranslations } from '@/lib/i18n/get-translations'
import { getStandardPostSort } from './topic-post-sort'

export async function TopicDataPointsPage({
  id,
  searchParams,
}: {
  id: string
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const t = await getTranslations()
  const q = typeof searchParams?.q === 'string' ? searchParams.q : undefined
  const sort = getStandardPostSort(searchParams?.sort)
  const queryParams = {
    data_point_topic: id,
    post_types: 'data_point',
    ...(q ? { q } : {}),
    sort,
    limit: 25,
  }
  const [dataResult, currentUser] = await Promise.all([
    getPosts({ searchParams: queryParams }).catch(error => {
      const message = getListSearchErrorMessage(error)
      if (!message) throw error
      return { error: message }
    }),
    getCurrentUser(),
  ])
  const hasSearchError = isListSearchErrorResult(dataResult)
  return (
    <div className='space-y-4'>
      <PostFilters defaultSort={sort} />
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
          hideDownCount={!canCurrentUserSeeDownvotes(currentUser)}
        />
      )}
    </div>
  )
}
