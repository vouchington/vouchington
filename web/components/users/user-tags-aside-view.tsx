'use client'

import { Card } from '@/components/ui/card'
import { ManageTagsDialog } from '@/components/tags/manage-tags-dialog'
import { UserTagsList } from './user-tags-list'
import type {
  EntityRelation,
  EntityRelationVote,
  EntityRelationsResponse,
} from '@/lib/api/entity-relations'
import type { EnumOption } from '@/components/tags/types'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useMemo } from 'react'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { fetchEntityRelations } from '@/lib/api/client/entity-relations'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { mergeEntityRelationPages } from '@/lib/api/merge-entity-relations'

interface UserTagsAsideViewProps {
  userId: string
  canManageUserTags: boolean
  initialData?: EntityRelationsResponse
  relations?: EntityRelation[]
  electionVotes?: Record<string, EntityRelationVote>
  catalog: EnumOption[]
}
const EMPTY_RELATIONS: EntityRelation[] = []

export function UserTagsAsideView({
  userId,
  canManageUserTags,
  initialData,
  relations: legacyRelations = EMPTY_RELATIONS,
  electionVotes,
  catalog,
}: UserTagsAsideViewProps) {
  const t = useTranslations()
  const firstPage = useMemo(
    () =>
      initialData ?? {
        results: legacyRelations.flatMap(relation =>
          relation.id ? [{ id: relation.id, __entity_type: 'entity_relation' as const }] : [],
        ),
        entity_relations: Object.fromEntries(
          legacyRelations.flatMap(relation => (relation.id ? [[relation.id, relation]] : [])),
        ),
        election_votes: electionVotes,
        page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
      },
    [electionVotes, initialData, legacyRelations],
  )
  const pagination = usePaginatedList(
    firstPage,
    `/api/v1/entity-relations/user/${encodeURIComponent(userId)}/category/topic`,
    { sort: 'best', positiveNetVoteScore: true },
    {
      loadPage: after =>
        fetchEntityRelations('user', userId, 'category', 'topic', {
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
    <Card
      className='p-4'
      data-pw='user-tags-aside'
    >
      <div className='mb-3 flex items-center justify-between'>
        <h3 className='text-sm font-semibold'>
          {t('extracted.users.userTagsAsideView.userTags_da694f83')}
        </h3>
        {canManageUserTags && (
          <ManageTagsDialog
            entityType='user'
            entityId={userId}
            predicate='category'
            objectType='topic'
            label={t('extracted.users.userTagsAsideView.user_3f4483c8')}
            heading={t('extracted.users.userTagsAsideView.userTags_da694f83')}
            dialogTitle={t('extracted.users.userTagsAsideView.manageUserTags_4909a20d')}
            dialogDescription={t(
              'extracted.users.userTagsAsideView.addAModerationTagOrVote_963cc71f',
            )}
            triggerLabel={t('extracted.users.userTagsAsideView.manage_5a234448')}
            enumOptions={catalog}
            enumSelectLabel={t('extracted.users.userTagsAsideView.selectAUserTagToAdd_d3e349db')}
            loadingText={t('extracted.users.userTagsAsideView.loadingUserTags_1d99f4e3')}
            errorText={t('extracted.users.userTagsAsideView.unableToLoadUserTags_f99065fc')}
            isAuthenticated
          />
        )}
      </div>
      {relations.length > 0 ? (
        <InfiniteScroll
          hasNextPage={pagination.hasNextPage}
          endCursor={pagination.endCursor}
          onLoadMore={handleLoadMore}
          loadingMore={pagination.loadingMore}
          fetchError={pagination.fetchError}
          clearError={pagination.clearError}
          resetKey={pagination.resetKey}
        >
          <UserTagsList
            relations={relations}
            electionVotes={merged.election_votes}
            canManageUserTags={canManageUserTags}
          />
        </InfiniteScroll>
      ) : (
        <div className='text-sm text-muted-foreground'>
          {t('extracted.users.userTagsAsideView.noUserTagsYet_71772144')}
        </div>
      )}
    </Card>
  )
}
