import { getEntityRelations } from '@/lib/api/server'
import { Card } from '@/components/ui/card'
import { TagList } from './tag-list'
import type { Topic } from '@/types/topics'
import { topicTagsHref } from '@/lib/links/entity-href'
import { TAG_ASIDE_SEARCH_PARAMS } from './tag-relation-configs'
import { getTranslations } from '@/lib/i18n/get-translations'
import { ManageTagsDialog } from './manage-tags-dialog'

interface TopicUrlTagAsideProps {
  topic: Topic
  isAuthenticated: boolean
  predicate: string
  segment: string
  title: string
}

export async function TopicUrlTagAside({
  topic,
  isAuthenticated,
  predicate,
  segment,
  title,
}: TopicUrlTagAsideProps) {
  const t = await getTranslations()
  const response = await getEntityRelations('topic', topic.id, predicate, 'url', {
    searchParams: TAG_ASIDE_SEARCH_PARAMS,
  })
  const relations = response.results.flatMap(result => {
    const relation = response.entity_relations[result.id]
    return relation ? [relation] : []
  })

  if (relations.length === 0 && !isAuthenticated) return null

  return (
    <Card className='p-4'>
      <div className='mb-3 flex items-center justify-between'>
        <h3 className='text-sm font-semibold'>{title}</h3>
        {isAuthenticated && (
          <ManageTagsDialog
            entityType='topic'
            entityId={topic.id}
            predicate={predicate}
            objectType='url'
            label={title}
            heading={title}
            dialogTitle={t('extracted.tags.topicUrlTagAside.manage_5a234448')}
            triggerLabel={t('extracted.tags.topicUrlTagAside.manage_5a234448')}
            manageHref={topicTagsHref(topic, segment)}
            loadingText={t('extracted.tags.manageTagsDialog.loading_47d2a515')}
            errorText={t('extracted.tags.manageTagsDialog.errorLoadingTags_8c1f5154')}
            isAuthenticated={isAuthenticated}
          />
        )}
      </div>
      {relations.length > 0 ? (
        <TagList
          relations={relations}
          objectType='url'
          showVoting={isAuthenticated}
          isAuthenticated={isAuthenticated}
        />
      ) : (
        <div className='text-sm text-muted-foreground'>
          {t('extracted.tags.topicUrlTagAside.noTitleSet_1c420825', { title: title.toLowerCase() })}
        </div>
      )}
    </Card>
  )
}
