import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getEntityRelations } from '@/lib/api/server'
import { PostRelatedTopicsAsideContent } from './post-related-topics-aside-content'
import { PostRelatedTopicsAsideStreaming } from './post-related-topics-aside-streaming'
import { renderAuthGatedStreaming } from './render-auth-gated-streaming'
import type { Post } from '@/types/posts'
import { TAG_ASIDE_SEARCH_PARAMS } from './tag-relation-configs'

interface PostRelatedTopicsAsideProps {
  post: Post
}

export async function PostRelatedTopicsAside({ post }: PostRelatedTopicsAsideProps) {
  const currentUser = await getCurrentUser()
  const responsePromise = getEntityRelations('post', post.id, 'category', 'topic', {
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
        <PostRelatedTopicsAsideContent
          post={post}
          relations={relations}
          showManageButton={false}
          showVoting={false}
          response={response}
        />
      )
    },
    renderStreaming: (
      <PostRelatedTopicsAsideStreaming
        post={post}
        responsePromise={responsePromise}
      />
    ),
  })
}
