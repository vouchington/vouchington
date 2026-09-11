'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import type { EditableState } from './topic-recommendation-editable-state'
import { useTranslations } from '@/lib/i18n/use-translations'

interface TopicTypeSelectProps {
  topicType: EditableState['topic_type']
  isAdmin: boolean
  onChange: (value: EditableState['topic_type']) => void
}

export function TopicRecommendationTypeSelect({
  topicType,
  isAdmin,
  onChange,
}: TopicTypeSelectProps) {
  const t = useTranslations()
  const options = [
    {
      value: 'topic',
      label: t('extracted.topicRecommendations.topicRecommendationDialogFields.topic_7e61847d'),
    },
    {
      value: 'referral_program',
      label: t(
        'extracted.topicRecommendations.topicRecommendationDialogFields.referralProgram_c4f204bd',
      ),
    },
    {
      value: 'card',
      label: t('extracted.topicRecommendations.topicRecommendationDialogFields.card_be3702e3'),
    },
  ] as const

  return (
    <div className='space-y-2'>
      <Label htmlFor='modal-topic-type'>
        {t('extracted.topicRecommendations.topicRecommendationDialogFields.topicType_a5f4489e')}
      </Label>
      <Select
        value={topicType}
        onValueChange={value => {
          onChange(value as EditableState['topic_type'])
        }}
        disabled={!isAdmin}
      >
        <SelectTrigger
          id='modal-topic-type'
          disabled={!isAdmin}
        >
          <SelectValue
            placeholder={t(
              'extracted.topicRecommendations.topicRecommendationDialogFields.selectType_b777140e',
            )}
          />
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem
              key={option.value}
              value={option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
