'use client'

import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { fetchEntityRelations } from '@/lib/api/client/entity-relations'
import { mergeEntityRelationPages } from '@/lib/api/merge-entity-relations'
import type { EntityRelationsResponse } from '@/lib/api/entity-relations'
import { useTranslations } from '@/lib/i18n/use-translations'
import { TagList } from './tag-list'

interface PaginatedEntityTagListProps {
  entityType: string
  entityId: string
  predicate: string
  objectType: string
  initialData: EntityRelationsResponse
  isAuthenticated: boolean
  showVoting: boolean
}

export function PaginatedEntityTagList({
  entityType,
  entityId,
  predicate,
  objectType,
  initialData,
  isAuthenticated,
  showVoting,
}: PaginatedEntityTagListProps) {
  const t = useTranslations()
  const endpoint = `/api/v1/entity-relations/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/${encodeURIComponent(predicate)}/${encodeURIComponent(objectType)}`
  const pagination = usePaginatedList(
    initialData,
    endpoint,
    { sort: 'best', positiveNetVoteScore: true },
    {
      loadPage: after =>
        fetchEntityRelations(entityType, entityId, predicate, objectType, {
          sort: 'best',
          positiveNetVoteScore: true,
          after,
        }),
    },
  )
  const merged = mergeEntityRelationPages(pagination.pages)
  const handleLoadMore = pagination.loadMore
  const relations = merged.results.flatMap(result => {
    const relation = merged.entity_relations[result.id]
    return relation ? [relation] : []
  })

  return (
    <InfiniteScroll
      hasNextPage={pagination.hasNextPage}
      endCursor={pagination.endCursor}
      onLoadMore={handleLoadMore}
      loadingMore={pagination.loadingMore}
      fetchError={pagination.fetchError}
      clearError={pagination.clearError}
      resetKey={pagination.resetKey}
    >
      <TagList
        relations={relations}
        electionVotes={merged.election_votes}
        objectType={objectType}
        showVoting={showVoting}
        isAuthenticated={isAuthenticated}
        t={t}
      />
    </InfiniteScroll>
  )
}
