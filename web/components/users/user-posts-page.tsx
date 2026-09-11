import { getPosts } from '@/lib/api/server'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { PostList } from '@/components/posts/post-list'
import { canCurrentUserSeeDownvotes } from '@/lib/permissions/can-see-downvotes'

interface UserPostsPageProps {
  idOrUsername: string
  postTypes?: 'review' | 'discussion' | 'comment'
}

export async function UserPostsPage({ idOrUsername, postTypes }: UserPostsPageProps) {
  const queryParams = {
    creator: idOrUsername,
    post_types: postTypes ?? 'review,discussion,comment',
    sort: 'new',
    limit: 25,
  }
  const [data, currentUser] = await Promise.all([
    getPosts({ searchParams: queryParams }),
    getCurrentUser(),
  ])

  return (
    <PostList
      data={data}
      nextPageEndpoint='/api/v1/posts'
      nextPageParams={queryParams}
      hideDownCount={!canCurrentUserSeeDownvotes(currentUser)}
    />
  )
}
