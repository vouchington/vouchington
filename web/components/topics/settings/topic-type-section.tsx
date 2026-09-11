'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations } from '@/lib/i18n/use-translations'
import { NON_SOURCE_TOPIC_TYPE_OPTIONS, TOPIC_TYPE_OPTIONS } from '@/types/topics'

export function TopicTypeSection({
  disabled,
  onTypeSubmit,
  setTopicTypeValue,
  topicTypeValue,
  typeSaving,
}: {
  disabled?: boolean
  onTypeSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  setTopicTypeValue: (value: string) => void
  topicTypeValue: string
  typeSaving: boolean
}) {
  const t = useTranslations()
  return (
    <section className='bg-card p-6 shadow-sm dark:shadow-none sm:rounded-lg'>
      <h2
        data-pw='topic-type-heading'
        className='mb-4 text-xl font-semibold text-foreground'
      >
        {t('extracted.settings.topicTypeSection.topicType_103abbf7')}
      </h2>
      <form
        onSubmit={onTypeSubmit}
        className='space-y-4'
      >
        <div>
          <Label htmlFor='topic_type'>
            {t('extracted.settings.topicTypeSection.type_baaddf70')}
          </Label>
          <Select
            disabled={disabled}
            value={topicTypeValue}
            onValueChange={setTopicTypeValue}
          >
            <SelectTrigger
              id='topic_type'
              data-pw='topic-type-trigger'
              disabled={disabled}
              className='mt-1'
            >
              <SelectValue
                placeholder={t('extracted.settings.topicTypeSection.selectType_be4423d7')}
              />
            </SelectTrigger>
            <SelectContent>
              {(topicTypeValue === 'rss_feed' || topicTypeValue === 'fediverse_instance'
                ? TOPIC_TYPE_OPTIONS
                : NON_SOURCE_TOPIC_TYPE_OPTIONS
              ).map(opt => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from option list
                  data-pw={`topic-type-option-${opt.value}`}
                >
                  {t(opt.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {disabled && (
          <p>{t('extracted.settings.topicTypeSection.sourceTopicsCannotChangeType_576b1ce8')}</p>
        )}
        <Button
          type='submit'
          loading={typeSaving}
          disabled={disabled || typeSaving}
        >
          {typeSaving
            ? t('extracted.settings.topicTypeSection.saving_dc85af8f')
            : t('extracted.settings.topicTypeSection.saveTopicType_06d31e93')}
        </Button>
      </form>
    </section>
  )
}
