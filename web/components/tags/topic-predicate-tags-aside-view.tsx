'use client'

import { Card } from '@/components/ui/card'
import type { EntityRelation, EntityRelationVote } from '@/lib/api/entity-relations'
import { useTranslations } from '@/lib/i18n/use-translations'
import { topicTagsHref } from '@/lib/links/entity-href'
import type { Topic } from '@/types/topics'
import { ManageTagsDialog } from './manage-tags-dialog'
import { TagList } from './tag-list'
import type { EnumOption } from './types'

export function TopicPredicateTagsAsideView({
  topic,
  isAuthenticated,
  relations,
  electionVotes,
  predicate,
  dataPw = 'category-tags-aside',
  title,
  manageLabel,
  emptyLabel,
  enumOptions,
}: {
  topic: Topic
  isAuthenticated: boolean
  relations: EntityRelation[]
  electionVotes?: Record<string, EntityRelationVote>
  predicate: 'category' | 'publisher_type'
  dataPw?: 'category-tags-aside' | 'publisher-type-aside'
  title: string
  manageLabel: string
  emptyLabel: string
  enumOptions?: EnumOption[]
}) {
  const t = useTranslations()
  if (relations.length === 0 && !isAuthenticated) return null

  return (
    <Card
      className='p-4'
      data-pw={dataPw}
    >
      <div className='mb-3 flex items-center justify-between'>
        <h3 className='text-sm font-semibold'>{title}</h3>
        {isAuthenticated && (
          <ManageTagsDialog
            dialogTitle={manageLabel}
            entityId={topic.id}
            entityType='topic'
            errorText={t('extracted.tags.manageTagsDialog.errorLoadingTags_8c1f5154')}
            heading={title}
            isAuthenticated={isAuthenticated}
            label={title}
            loadingText={t('extracted.tags.manageTagsDialog.loading_47d2a515')}
            manageHref={topicTagsHref(topic, predicate)}
            objectType='topic'
            predicate={predicate}
            triggerLabel={manageLabel}
            {...(enumOptions !== undefined ? { enumOptions } : {})}
          />
        )}
      </div>
      {relations.length > 0 ? (
        <TagList
          electionVotes={electionVotes}
          isAuthenticated={isAuthenticated}
          objectType='topic'
          relations={relations}
          showVoting={isAuthenticated}
        />
      ) : (
        <div className='text-sm text-muted-foreground'>{emptyLabel}</div>
      )}
    </Card>
  )
}
