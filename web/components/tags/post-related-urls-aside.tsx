import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getEntityRelations } from '@/lib/api/server'
import { PostRelatedUrlsAsideContent } from './post-related-urls-aside-content'
import { PostRelatedUrlsAsideStreaming } from './post-related-urls-aside-streaming'
import { renderAuthGatedStreaming } from './render-auth-gated-streaming'
import type { Post } from '@/types/posts'
import { POST_RELATED_URL_SUMMARY_SEARCH_PARAMS } from './tag-relation-configs'

interface PostRelatedUrlsAsideProps {
  post: Post
}

export async function PostRelatedUrlsAside({ post }: PostRelatedUrlsAsideProps) {
  const currentUser = await getCurrentUser()
  const responsePromise = getEntityRelations('post', post.id, 'related', 'url', {
    searchParams: POST_RELATED_URL_SUMMARY_SEARCH_PARAMS,
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
        <PostRelatedUrlsAsideContent
          post={post}
          relations={relations}
          showManageButton={false}
          showVoting={false}
        />
      )
    },
    renderStreaming: (
      <PostRelatedUrlsAsideStreaming
        post={post}
        responsePromise={responsePromise}
      />
    ),
  })
}
