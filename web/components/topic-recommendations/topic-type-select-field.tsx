'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { TopicRecommendationTopicType } from './topic-recommendation-topic-type'

interface TopicTypeSelectFieldProps {
  value: TopicRecommendationTopicType
  onValueChange: (value: TopicRecommendationTopicType) => void
}

export function TopicTypeSelectField({ value, onValueChange }: TopicTypeSelectFieldProps) {
  const t = useTranslations()
  const topicTypeOptions = [
    {
      value: 'topic',
      label: t('extracted.topicRecommendations.topicTypeSelectField.topic_7e61847d'),
    },
    {
      value: 'referral_program',
      label: t('extracted.topicRecommendations.topicTypeSelectField.referralProgram_c4f204bd'),
    },
    {
      value: 'card',
      label: t('extracted.topicRecommendations.topicTypeSelectField.card_be3702e3'),
    },
  ] as const

  return (
    <div className='space-y-2'>
      <Label htmlFor='topic_type'>
        {t('extracted.topicRecommendations.topicRecommendationFormFields.topicType_103abbf7')}
      </Label>
      <Select
        value={value}
        onValueChange={v => onValueChange(v as TopicRecommendationTopicType)}
      >
        <SelectTrigger
          id='topic_type'
          data-pw='topic-recommendation-form-topic-type'
        >
          <SelectValue
            placeholder={t(
              'extracted.topicRecommendations.topicRecommendationFormFields.selectType_b777140e',
            )}
          />
        </SelectTrigger>
        <SelectContent>
          {topicTypeOptions.map(option => (
            <SelectItem
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type='hidden'
        name='topic_type'
        value={value}
      />
    </div>
  )
}
