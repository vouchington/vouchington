'use client'

import { use } from 'react'
import dynamic from 'next/dynamic'
import { TagList } from './tag-list'
import type { EntityRelationsResponse } from '@/lib/api/entity-relations'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { EnumOption } from './types'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { fetchEntityRelations } from '@/lib/api/client/entity-relations'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { mergeEntityRelationPages } from '@/lib/api/merge-entity-relations'
import type { AddTagForm as AddTagFormComponent } from './add-tag-form'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const AddTagForm = dynamic<Parameters<typeof AddTagFormComponent>[0]>(() =>
  import('./add-tag-form').then(m => ({ default: m.AddTagForm })),
)

interface ManageTagsContentProps {
  entityType: string
  entityId: string
  predicate: string
  objectType: 'topic' | 'post' | 'url'
  label: string
  relationsPromise: Promise<EntityRelationsResponse>
  isAuthenticated: boolean
  enumOptions?: EnumOption[]
  enumSelectLabel?: string
  onRelationsChange?: () => void
}

export function ManageTagsContent({
  entityType,
  entityId,
  predicate,
  objectType,
  label,
  relationsPromise,
  isAuthenticated,
  enumOptions,
  enumSelectLabel,
  onRelationsChange,
}: ManageTagsContentProps) {
  const t = useTranslations()
  const initialData = use(relationsPromise)
  const endpoint = `/api/v1/entity-relations/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/${encodeURIComponent(predicate)}/${encodeURIComponent(objectType)}`
  const pagination = usePaginatedList(
    initialData,
    endpoint,
    { sort: 'best' },
    {
      loadPage: after =>
        fetchEntityRelations(entityType, entityId, predicate, objectType, { sort: 'best', after }),
    },
  )
  const merged = mergeEntityRelationPages(pagination.pages)
  const handleLoadMore = pagination.loadMore
  const { results, entity_relations, election_votes } = merged
  const relations = results.flatMap(r => {
    const rel = entity_relations[r.id]
    return rel ? [rel] : []
  })
  const excludeIds = relations.flatMap(r => (r.object_id ? [r.object_id] : []))

  return (
    <div className='space-y-6'>
      {isAuthenticated && (
        <AddTagForm
          entityType={entityType}
          entityId={entityId}
          predicate={predicate}
          objectType={objectType}
          excludeIds={excludeIds}
          enumOptions={enumOptions}
          enumSelectLabel={enumSelectLabel}
          onTagAdded={onRelationsChange}
        />
      )}

      <div data-pw='manage-tags-current-section'>
        <h2
          className='mb-3 text-lg font-semibold'
          data-pw='manage-tags-current-heading'
        >
          {t('extracted.tags.manageTagsContent.currentLabelTags_77192984', { label })}
        </h2>
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
            electionVotes={election_votes}
            objectType={objectType}
            showVoting
            isAuthenticated={isAuthenticated}
            onVoteSubmitted={onRelationsChange}
          />
        </InfiniteScroll>
      </div>
    </div>
  )
}
