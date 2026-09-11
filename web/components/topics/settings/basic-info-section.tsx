'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useDidHydrate } from '@/hooks/use-did-hydrate'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { Topic } from '@/types/topics'

export function BasicInfoSection({
  basicSaving,
  onBasicSubmit,
  topic,
}: {
  basicSaving: boolean
  onBasicSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  topic: Topic
}) {
  const t = useTranslations()
  const mounted = useDidHydrate()

  return (
    <section className='bg-card p-6 shadow-sm dark:shadow-none sm:rounded-lg'>
      <h2
        data-pw='basic-info-heading'
        className='mb-4 text-xl font-semibold text-foreground'
      >
        {t('extracted.settings.basicInfoSection.basicInfo_c6b65932')}
      </h2>
      <form
        onSubmit={onBasicSubmit}
        className='space-y-4'
      >
        <div>
          <Label htmlFor='name'>{t('extracted.settings.basicInfoSection.name_dcd1d522')}</Label>
          <Input
            type='text'
            id='name'
            name='name'
            data-pw='topic-edit-name-input'
            defaultValue={topic.name}
            required
            placeholder={t('extracted.settings.basicInfoSection.topicName_c05cbe5c')}
            className='mt-1'
            dir='auto'
          />
        </div>
        <div>
          <Label htmlFor='markdown'>
            {t('extracted.settings.basicInfoSection.markdown_0e52f6b9')}
          </Label>
          <Textarea
            id='markdown'
            name='markdown'
            data-pw='topic-edit-markdown-input'
            rows={6}
            defaultValue={topic.markdown ?? ''}
            placeholder={t(
              'extracted.settings.basicInfoSection.writeMarkdownForThisTopic_03faf439',
            )}
            className='mt-1 font-mono'
            dir='auto'
          />
        </div>
        <Button
          type='submit'
          data-pw='save-basic-info'
          loading={basicSaving}
          disabled={!mounted || basicSaving}
        >
          {basicSaving
            ? t('extracted.settings.basicInfoSection.saving_dc85af8f')
            : t('extracted.settings.basicInfoSection.saveBasicInfo_4d732e7d')}
        </Button>
      </form>
    </section>
  )
}
