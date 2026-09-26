'use client'

import { Card } from '@/components/ui/card'
import { topicTagsHref } from '@/lib/links/entity-href'
import type { EntityRelation, EntityRelationVote } from '@/lib/api/entity-relations'
import type { Topic } from '@/types/topics'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ManageTagsDialog } from './manage-tags-dialog'
import { TagList } from './tag-list'
import type { EnumOption } from './types'

export function TopicPublisherTypesAsideView({
  topic,
  isAuthenticated,
  relations,
  electionVotes,
  enumOptions,
}: {
  topic: Topic
  isAuthenticated: boolean
  relations: EntityRelation[]
  electionVotes?: Record<string, EntityRelationVote>
  enumOptions?: EnumOption[]
}) {
  const t = useTranslations()
  if (topic.topic_type !== 'rss_feed') return null
  if (relations.length === 0 && !isAuthenticated) return null

  return (
    <Card
      className='p-4'
      data-pw='publisher-type-aside'
    >
      <div className='mb-3 flex items-center justify-between'>
        <h3 className='text-sm font-semibold'>
          {t('extracted.tags.topicPublisherTypesAside.publisherType_9b943044')}
        </h3>
        {isAuthenticated && (
          <ManageTagsDialog
            entityType='topic'
            entityId={topic.id}
            predicate='publisher_type'
            objectType='topic'
            label={t('extracted.tags.topicPublisherTypesAside.publisherType_9b943044')}
            heading={t('extracted.tags.topicPublisherTypesAside.publisherType_9b943044')}
            dialogTitle={t('extracted.tags.topicPublisherTypesAside.manage_5a234448')}
            triggerLabel={t('extracted.tags.topicPublisherTypesAside.manage_5a234448')}
            manageHref={topicTagsHref(topic, 'publisher_type')}
            enumOptions={enumOptions}
            loadingText={t('extracted.tags.manageTagsDialog.loading_47d2a515')}
            errorText={t('extracted.tags.manageTagsDialog.errorLoadingTags_8c1f5154')}
            isAuthenticated={isAuthenticated}
          />
        )}
      </div>
      {relations.length > 0 ? (
        <TagList
          relations={relations}
          electionVotes={electionVotes}
          objectType='topic'
          showVoting={isAuthenticated}
          isAuthenticated={isAuthenticated}
        />
      ) : (
        <div className='text-sm text-muted-foreground'>
          {t('extracted.tags.topicPublisherTypesAside.noPublisherTypeSet_e7af1583')}
        </div>
      )}
    </Card>
  )
}
