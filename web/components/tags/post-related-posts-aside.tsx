import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getEntityRelations } from '@/lib/api/server'
import { PostRelatedPostsAsideContent } from './post-related-posts-aside-content'
import { PostRelatedPostsAsideStreaming } from './post-related-posts-aside-streaming'
import { renderAuthGatedStreaming } from './render-auth-gated-streaming'
import type { Post } from '@/types/posts'
import { TAG_ASIDE_SEARCH_PARAMS } from './tag-relation-configs'

interface PostRelatedPostsAsideProps {
  post: Post
}

export async function PostRelatedPostsAside({ post }: PostRelatedPostsAsideProps) {
  const currentUser = await getCurrentUser()
  const responsePromise = getEntityRelations('post', post.id, 'related', 'post', {
    searchParams: TAG_ASIDE_SEARCH_PARAMS,
  })

  return renderAuthGatedStreaming({
    isAuthenticated: currentUser !== null,
    dataPromise: responsePromise,
    renderLoggedOut: response => {
      const { results, entity_relations } = response
      const relations = results.flatMap(r => {
        const rel = entity_relations[r.id]
        return rel ? [rel] : []
      })
      if (relations.length === 0) return null
      return (
        <PostRelatedPostsAsideContent
          post={post}
          relations={relations}
          showManageButton={false}
          showVoting={false}
          response={response}
        />
      )
    },
    renderStreaming: (
      <PostRelatedPostsAsideStreaming
        post={post}
        responsePromise={responsePromise}
      />
    ),
  })
}
