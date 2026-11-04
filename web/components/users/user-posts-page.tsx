import { getPosts } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { PostList } from '@/components/posts/post-list'
import { PostTimeRangeSelect } from '@/components/posts/post-time-range-select'
import { canCurrentUserSeeDownvotes } from '@/lib/permissions/can-see-downvotes'
import { postTimeRangeParams } from '@/lib/posts/time-range'

interface UserPostsPageProps {
  idOrUsername: string
  postTypes?: 'review' | 'discussion' | 'comment'
  /** The `time_range` search param of the route. */
  timeRange?: string | string[]
}

export async function UserPostsPage({ idOrUsername, postTypes, timeRange }: UserPostsPageProps) {
  const queryParams = {
    creator: idOrUsername,
    post_types: postTypes ?? 'review,discussion,comment',
    ...postTimeRangeParams(timeRange),
    sort: 'new',
    limit: 25,
  }
  const [data, currentUser] = await Promise.all([
    getPosts({ searchParams: queryParams }),
    getCurrentUser(),
  ])

  return (
    <div className='space-y-4'>
      <PostTimeRangeSelect />
      <PostList
        data={data}
        nextPageEndpoint='/api/v1/posts'
        nextPageParams={queryParams}
        hideDownCount={!canCurrentUserSeeDownvotes(currentUser)}
      />
    </div>
  )
}
