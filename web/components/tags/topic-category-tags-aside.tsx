import { getEntityRelations } from '@/lib/api/server'
import { Card } from '@/components/ui/card'
import { TagList } from './tag-list'
import { topicApiId, topicTagsHref } from '@/lib/links/entity-href'
import type { Topic } from '@/types/topics'
import { TAG_ASIDE_SEARCH_PARAMS } from './tag-relation-configs'
import { getTranslations } from '@/lib/i18n/get-translations'
import { ManageTagsDialog } from './manage-tags-dialog'

interface TopicCategoryTagsAsideProps {
  topic: Topic
  isAuthenticated: boolean
}

export async function TopicCategoryTagsAside({
  topic,
  isAuthenticated,
}: TopicCategoryTagsAsideProps) {
  const t = await getTranslations()
  const response = await getEntityRelations('topic', topicApiId(topic), 'category', 'topic', {
    searchParams: TAG_ASIDE_SEARCH_PARAMS,
  })
  const relations = response.results.flatMap(result => {
    const relation = response.entity_relations[result.id]
    return relation ? [relation] : []
  })

  if (relations.length === 0 && !isAuthenticated) return null

  return (
    <Card
      className='p-4'
      data-pw='category-tags-aside'
    >
      <div className='mb-3 flex items-center justify-between'>
        <h3 className='text-sm font-semibold'>
          {t('extracted.tags.topicCategoryTagsAside.categories_b8b1d894')}
        </h3>
        {isAuthenticated && (
          <ManageTagsDialog
            entityType='topic'
            entityId={topic.id}
            predicate='category'
            objectType='topic'
            label={t('extracted.tags.topicCategoryTagsAside.categories_b8b1d894')}
            heading={t('extracted.tags.topicCategoryTagsAside.categories_b8b1d894')}
            dialogTitle={t('extracted.tags.topicCategoryTagsAside.manage_5a234448')}
            triggerLabel={t('extracted.tags.topicCategoryTagsAside.manage_5a234448')}
            manageHref={topicTagsHref(topic, 'category')}
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
          {t('extracted.tags.topicCategoryTagsAside.noCategoriesYet_7465b456')}
        </div>
      )}
    </Card>
  )
}
