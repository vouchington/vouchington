'use client'

import { useRouter } from 'next/navigation'
import { TagList } from '@/components/tags/tag-list'
import type { EntityRelation, EntityRelationVote } from '@/lib/api/entity-relations'

interface UserTagsListProps {
  relations: EntityRelation[]
  electionVotes?: Record<string, EntityRelationVote>
  canManageUserTags: boolean
}

export function UserTagsList({ relations, electionVotes, canManageUserTags }: UserTagsListProps) {
  const { refresh } = useRouter()

  return (
    <TagList
      relations={relations}
      electionVotes={electionVotes}
      objectType='topic'
      showVoting
      isAuthenticated
      allowOfficialAccounts={canManageUserTags}
      onVoteSubmitted={refresh}
    />
  )
}
