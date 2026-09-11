'use client'

import { use } from 'react'
import { PostRelatedUrlsAsideContent } from './post-related-urls-aside-content'
import type { Post } from '@/types/posts'
import type { EntityRelationsResponse } from '@/lib/api/entity-relations'

interface PostRelatedUrlsAsideStreamingProps {
  post: Post
  responsePromise: Promise<EntityRelationsResponse>
}

export function PostRelatedUrlsAsideStreaming({
  post,
  responsePromise,
}: PostRelatedUrlsAsideStreamingProps) {
  const response = use(responsePromise)
  const { results, entity_relations, election_votes } = response
  const relations = results.flatMap(r => {
    const rel = entity_relations[r.id]
    return rel ? [rel] : []
  })
  if (relations.length === 0) return null
  return (
    <PostRelatedUrlsAsideContent
      post={post}
      relations={relations}
      electionVotes={election_votes}
      showManageButton
      isAuthenticated
    />
  )
}
