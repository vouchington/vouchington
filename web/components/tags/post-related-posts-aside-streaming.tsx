'use client'

import { use } from 'react'
import { PostRelatedPostsAsideContent } from './post-related-posts-aside-content'
import type { Post } from '@/types/posts'
import type { EntityRelationsResponse } from '@/lib/api/entity-relations'

interface PostRelatedPostsAsideStreamingProps {
  post: Post
  responsePromise: Promise<EntityRelationsResponse>
}

export function PostRelatedPostsAsideStreaming({
  post,
  responsePromise,
}: PostRelatedPostsAsideStreamingProps) {
  const response = use(responsePromise)
  const { results, entity_relations, election_votes } = response
  const relations = results.flatMap(r => {
    const rel = entity_relations[r.id]
    return rel ? [rel] : []
  })
  if (relations.length === 0) return null
  return (
    <PostRelatedPostsAsideContent
      post={post}
      relations={relations}
      electionVotes={election_votes}
      response={response}
      showManageButton
      isAuthenticated
    />
  )
}
