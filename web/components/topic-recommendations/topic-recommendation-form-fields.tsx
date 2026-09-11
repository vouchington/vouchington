// oxlint-disable react-doctor/no-derived-useState -- initial state from defaults prop is intentional
'use client'

import { type ChangeEvent, startTransition, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { slugify } from '@ts-shared/utils/slugs'
import type { getRecommendationFormDefaults } from './topic-recommendation-form-codecs'
import { useTranslations } from '@/lib/i18n/use-translations'
import { TopicTypeSelectField } from './topic-type-select-field'
import { TopicRecommendationTypeSpecificFields } from './topic-recommendation-type-specific-fields'
import type { TopicRecommendationTopicType } from './topic-recommendation-topic-type'

interface TopicRecommendationFormFieldsProps {
  defaults: ReturnType<typeof getRecommendationFormDefaults>
  onTitleSlugChange?: (title: string, slug: string) => void
}

export function TopicRecommendationFormFields({
  defaults,
  onTitleSlugChange,
}: TopicRecommendationFormFieldsProps) {
  const t = useTranslations()
  const [topicTitle, setTopicTitle] = useState(defaults.topic_title)
  const [topicSlug, setTopicSlug] = useState(defaults.topic_slug)
  const [topicType, setTopicType] = useState<TopicRecommendationTopicType>(defaults.topic_type)
  const slugManuallyEdited = useRef(!!defaults.topic_slug)

  function handleTitleChange(e: ChangeEvent<HTMLInputElement>) {
    const title = e.target.value
    const slug = slugManuallyEdited.current ? topicSlug : slugify(title)
    setTopicTitle(title)
    if (!slugManuallyEdited.current) setTopicSlug(slug)
    onTitleSlugChange?.(title, slug)
  }
  function handleSlugChange(e: ChangeEvent<HTMLInputElement>) {
    slugManuallyEdited.current = true
    const slug = e.target.value
    setTopicSlug(slug)
    onTitleSlugChange?.(topicTitle, slug)
  }
  return (
    <div className='space-y-4'>
      <TopicTypeSelectField
        value={topicType}
        onValueChange={value => startTransition(() => setTopicType(value))}
      />

      <div className='space-y-2'>
        <Label htmlFor='topic_title'>
          {t(
            'extracted.topicRecommendations.topicRecommendationFormFields.proposedTopicTitle_830ec135',
          )}
        </Label>
        <Input
          id='topic_title'
          name='topic_title'
          required
          value={topicTitle}
          onChange={handleTitleChange}
          placeholder={t(
            'extracted.topicRecommendations.topicRecommendationFormFields.topicTitle_0adc1126',
          )}
          data-pw='topic-recommendation-form-topic-title'
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='topic_slug'>
          {t(
            'extracted.topicRecommendations.topicRecommendationFormFields.proposedTopicSlug_34fa8d18',
          )}
        </Label>
        <Input
          id='topic_slug'
          name='topic_slug'
          required
          value={topicSlug}
          onChange={handleSlugChange}
          placeholder={t(
            'extracted.topicRecommendations.topicRecommendationFormFields.topicSlug_5f28691b',
          )}
          data-pw='topic-recommendation-form-topic-slug'
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='topic_markdown'>
          {t(
            'extracted.topicRecommendations.topicRecommendationFormFields.topicDescriptionMarkdown_44e56897',
          )}
        </Label>
        <Textarea
          id='topic_markdown'
          name='topic_markdown'
          rows={6}
          defaultValue={defaults.topic_markdown}
          placeholder={t(
            'extracted.topicRecommendations.topicRecommendationFormFields.topicDescriptionMarkdown_96c0b3be',
          )}
          data-pw='topic-recommendation-form-topic-markdown'
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='topic_hostname'>
          {t(
            'extracted.topicRecommendations.topicRecommendationFormFields.primaryHostname_1b88d264',
          )}
        </Label>
        <Input
          id='topic_hostname'
          name='topic_hostname'
          placeholder={t(
            'extracted.topicRecommendations.topicRecommendationFormFields.exampleCom_a379a6f6',
          )}
          defaultValue={defaults.topic_hostname}
          data-pw='topic-recommendation-form-topic-hostname'
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='title'>
          {t(
            'extracted.topicRecommendations.topicRecommendationFormFields.recommendationTitle_d5fd4934',
          )}
        </Label>
        <Input
          id='title'
          name='title'
          placeholder={t(
            'extracted.topicRecommendations.topicRecommendationFormFields.optionalShortRationaleHeadline_cdd4e464',
          )}
          defaultValue={defaults.title}
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='topic_hostnames'>
          {t(
            'extracted.topicRecommendations.topicRecommendationFormFields.relatedHostnames_44fc9371',
          )}
        </Label>
        <Textarea
          id='topic_hostnames'
          name='topic_hostnames'
          rows={4}
          placeholder={t(
            'extracted.topicRecommendations.topicRecommendationFormFields.exampleComExampleOrg_2a6cfad8',
          )}
          defaultValue={defaults.topic_hostnames}
          data-pw='topic-recommendation-form-topic-hostnames'
        />
      </div>

      <TopicRecommendationTypeSpecificFields
        topicType={topicType}
        defaults={defaults}
      />

      <div className='space-y-2'>
        <Label htmlFor='markdown'>
          {t(
            'extracted.topicRecommendations.topicRecommendationFormFields.whyShouldThisTopicExist_0eb5cbaf',
          )}
        </Label>
        <Textarea
          id='markdown'
          name='markdown'
          rows={10}
          required
          defaultValue={defaults.markdown}
          placeholder={t(
            'extracted.topicRecommendations.topicRecommendationFormFields.explainWhyThisTopicShouldExist_77b65fa8',
          )}
          data-pw='topic-recommendation-form-markdown'
        />
      </div>
    </div>
  )
}
