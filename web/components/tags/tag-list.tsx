import { TagItem } from './tag-item'
import type { EntityRelation, EntityRelationVote } from '@/lib/api/entity-relations'
import type { useTranslations } from '@/lib/i18n/use-translations'

interface TagListProps {
  relations: EntityRelation[]
  electionVotes?: Record<string, EntityRelationVote>
  objectType: string
  showVoting?: boolean
  isAuthenticated?: boolean
  allowOfficialAccounts?: boolean
  t?: ReturnType<typeof useTranslations>
  onVoteSubmitted?: () => void
}

export function TagList({
  relations,
  electionVotes,
  objectType,
  showVoting = false,
  isAuthenticated = false,
  allowOfficialAccounts = true,
  t,
  onVoteSubmitted,
}: TagListProps) {
  if (relations.length === 0) {
    return (
      <div
        className='text-sm text-muted-foreground'
        data-pw='tag-list-empty'
      >
        {t
          ? t('extracted.tags.tagList.noObjecttypeSTaggedYet_5b2c9dd9', { objectType })
          : `No ${objectType}s tagged yet.`}
      </div>
    )
  }

  return (
    <div className='space-y-2'>
      {relations.map(relation => {
        const key = relation.object_id
        const existingVote = relation.id ? electionVotes?.[relation.id] : undefined
        return (
          <TagItem
            key={key}
            relation={relation}
            existingVoteChoice={
              existingVote?.choice as
                | import('@/lib/api/client/elections').RelationChoice
                | undefined
            }
            objectType={objectType}
            showVoting={showVoting}
            isAuthenticated={isAuthenticated}
            allowOfficialAccounts={allowOfficialAccounts}
            onVoteSubmitted={onVoteSubmitted}
          />
        )
      })}
    </div>
  )
}
