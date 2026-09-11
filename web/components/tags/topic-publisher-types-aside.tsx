import { getEntityRelations } from '@/lib/api/server'
import { Card } from '@/components/ui/card'
import { TagList } from './tag-list'
import { topicApiId, topicTagsHref } from '@/lib/links/entity-href'
import type { Topic } from '@/types/topics'
import { TAG_ASIDE_SEARCH_PARAMS } from './tag-relation-configs'
import { getTranslations } from '@/lib/i18n/get-translations'
import { getPublisherTypes } from '@/lib/api/server/topics'
import { ManageTagsDialog } from './manage-tags-dialog'

interface TopicPublisherTypesAsideProps {
  topic: Topic
  isAuthenticated: boolean
}

async function getPublisherTypeOptions(isAuthenticated: boolean) {
  if (!isAuthenticated) return undefined
  try {
    return (await getPublisherTypes()).publisher_types
  } catch {
    return undefined
  }
}

export async function TopicPublisherTypesAside({
  topic,
  isAuthenticated,
}: TopicPublisherTypesAsideProps) {
  if (topic.topic_type !== 'rss_feed') return null

  const t = await getTranslations()

  const response = await getEntityRelations('topic', topicApiId(topic), 'publisher_type', 'topic', {
    searchParams: TAG_ASIDE_SEARCH_PARAMS,
  })
  const relations = response.results.flatMap(result => {
    const relation = response.entity_relations[result.id]
    return relation ? [relation] : []
  })

  if (relations.length === 0 && !isAuthenticated) return null
  const enumOptions = await getPublisherTypeOptions(isAuthenticated)

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
          electionVotes={response.election_votes}
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
