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
import { Textarea } from '@/components/ui/textarea'
import { NON_SOURCE_TOPIC_TYPE_OPTIONS, type TopicTypes } from '@/types/topics'
import { useTranslations } from '@/lib/i18n/use-translations'

interface CreateTopicFormFieldsProps {
  topicType: TopicTypes
  onTopicTypeChange: (value: TopicTypes) => void
  markdown: string
  onMarkdownChange: (value: string) => void
}

export function CreateTopicFormFields({
  topicType,
  onTopicTypeChange,
  markdown,
  onMarkdownChange,
}: CreateTopicFormFieldsProps) {
  const t = useTranslations()

  return (
    <>
      <div>
        <Label htmlFor='topic_type'>
          {t('extracted.create.createTopicClient.topicType_103abbf7')}
        </Label>
        <Select
          value={topicType}
          onValueChange={value => onTopicTypeChange(value as TopicTypes)}
        >
          <SelectTrigger
            id='topic_type'
            className='mt-1'
          >
            <SelectValue
              placeholder={t('extracted.create.createTopicClient.selectTopicType_ccc22f18')}
            />
          </SelectTrigger>
          <SelectContent>
            {NON_SOURCE_TOPIC_TYPE_OPTIONS.map(opt => (
              <SelectItem
                key={opt.value}
                value={opt.value}
              >
                {t(opt.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor='hostname'>
          {t('extracted.create.createTopicClient.hostname_2db53355')}
        </Label>
        <Input
          type='text'
          id='hostname'
          name='hostname'
          data-pw='create-topic-hostname-input'
          placeholder={t('extracted.create.createTopicClient.eGThepointsguyCom_26337ab3')}
          className='mt-1'
        />
      </div>

      <div>
        <Label htmlFor='markdown'>
          {t('extracted.create.createTopicClient.descriptionMarkdown_9a318581')}
        </Label>
        <Textarea
          id='markdown'
          name='markdown'
          data-pw='create-topic-markdown-input'
          rows={8}
          placeholder={t(
            'extracted.create.createTopicClient.writeAShortMarkdownDescription_2341f3c8',
          )}
          className='mt-1'
          value={markdown}
          onChange={e => onMarkdownChange(e.target.value)}
        />
      </div>
    </>
  )
}
