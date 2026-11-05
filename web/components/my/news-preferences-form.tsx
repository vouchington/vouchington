'use client'

import { Label } from '@/components/ui/label'
import { EntityBookmarkButton } from '@/components/shared/entity-bookmark-button'
import type { Topic } from '@/types/topics'
import { useTranslations } from '@/lib/i18n/use-translations'
import { DataPw } from '@/components/shared/data-pw'

interface NewsPreferencesFormProps {
  publisherTypes: Topic[]
}

export function NewsPreferencesForm({ publisherTypes }: NewsPreferencesFormProps) {
  const t = useTranslations()
  if (publisherTypes.length === 0) return null

  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <Label>{t('extracted.my.newsPreferencesForm.mutedPublisherTypes_ef024a71')}</Label>
        <p className='text-xs text-muted-foreground'>
          {t('extracted.my.newsPreferencesForm.mutePublisherTypesToHideThem_f3c18a82')}
        </p>
        <ul className='divide-y'>
          {publisherTypes.map(topic => (
            <li
              key={topic.id}
              className='flex items-center gap-3 py-2'
            >
              <DataPw
                dataPw={`news-pref-mute-${topic.slug}`}
                as={EntityBookmarkButton}
                entityType='topic'
                entityId={topic.id}
                preset='mute'
                aria-label={t('extracted.my.newsPreferencesForm.muteName_f252a4cc', {
                  name: topic.name,
                })}
              />
              <span className='text-sm'>{topic.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
