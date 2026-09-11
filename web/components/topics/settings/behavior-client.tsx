'use client'

import { useRouter } from 'next/navigation'
import { SpendingCategorySection } from './spending-category-section'
import { TopicFlagsSection } from './topic-flags-section'
import { TopicTypeSection } from './topic-type-section'
import { TypeAttributesSection } from './type-attributes-section'
import { useTopicEditPage } from './use-topic-edit-page'
import type { TopicEditState } from './topic-edit-model'
import { useTranslations } from '@/lib/i18n/use-translations'

export function BehaviorClient({
  id,
  topicType,
  initialData,
}: {
  id: string
  topicType: string
  initialData: Partial<TopicEditState>
}) {
  const t = useTranslations()
  const router = useRouter()
  const { handlers, state } = useTopicEditPage(id, topicType, router, initialData)

  if (state.loadError && !state.topic) {
    return (
      <div className='rounded-md bg-red-50 p-4'>
        <p className='text-sm text-red-800'>{state.loadError}</p>
      </div>
    )
  }

  if (!state.topic)
    return <div>{t('extracted.settings.behaviorClient.topicNotFound_a53e8c70')}</div>

  return (
    <div
      data-pw='topic-settings-behavior'
      className='space-y-8'
    >
      <TopicTypeSection
        disabled={state.topic.topic_type === 'rss_feed'}
        onTypeSubmit={handlers.handleTypeSubmit}
        setTopicTypeValue={handlers.setTopicTypeValue}
        topicTypeValue={state.topicTypeValue}
        typeSaving={state.typeSaving}
      />
      <TypeAttributesSection
        topicId={state.topic.id}
        currentTopicType={state.topic.topic_type}
        onTypeAttrSubmit={handlers.handleTypeAttrSubmit}
        typeAttributes={state.typeAttributes}
        typeAttributeNames={state.typeAttributeNames}
        typeAttrSaving={state.typeAttrSaving}
      />
      <TopicFlagsSection
        noindex={state.topic.noindex}
        allowReviews={state.topic.allow_reviews}
        onFlagsSubmit={handlers.handleFlagsSubmit}
        setNoindex={handlers.setNoindex}
        setAllowReviews={handlers.setAllowReviews}
        flagsSaving={state.flagsSaving}
      />
      <SpendingCategorySection
        isForeignTransaction={state.isForeignTransaction}
        onSpendingSubmit={handlers.handleSpendingSubmit}
        setIsForeignTransaction={handlers.setIsForeignTransaction}
        setSpendingFrequency={handlers.setSpendingFrequency}
        spendingFrequency={state.spendingFrequency}
        spendingSaving={state.spendingSaving}
      />
    </div>
  )
}
