'use client'

import { use } from 'react'
import { PostRelatedTopicsAsideContent } from './post-related-topics-aside-content'
import type { Post } from '@/types/posts'
import type { EntityRelationsResponse } from '@/lib/api/entity-relations'

interface PostRelatedTopicsAsideStreamingProps {
  post: Post
  responsePromise: Promise<EntityRelationsResponse>
}

export function PostRelatedTopicsAsideStreaming({
  post,
  responsePromise,
}: PostRelatedTopicsAsideStreamingProps) {
  const response = use(responsePromise)
  const { results, entity_relations, election_votes } = response
  const relations = results.flatMap(r => {
    const rel = entity_relations[r.id]
    return rel ? [rel] : []
  })
  if (relations.length === 0) return null
  return (
    <PostRelatedTopicsAsideContent
      post={post}
      relations={relations}
      electionVotes={election_votes}
      response={response}
      showManageButton
      isAuthenticated
    />
  )
}
