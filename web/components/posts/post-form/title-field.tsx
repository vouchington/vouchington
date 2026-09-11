'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslations } from '@/lib/i18n/use-translations'

export function TitleField({
  contentLocked,
  setTitle,
  title,
}: {
  contentLocked: boolean
  setTitle: (title: string) => void
  title: string
}) {
  const t = useTranslations()
  return (
    <>
      {contentLocked && (
        <p
          className='text-sm text-muted-foreground'
          data-pw='post-form-content-locked-notice'
        >
          {t('extracted.postForm.titleField.titleAndContentCanNoLonger_6d8873c0')}
        </p>
      )}
      <div className='space-y-2'>
        <Label htmlFor='title'>{t('extracted.postForm.titleField.titleOptional_8280fbd6')}</Label>
        <Input
          id='title'
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={t('extracted.postForm.titleField.giveYourPostATitle_52eb1ab8')}
          disabled={contentLocked}
          data-pw='post-form-title-input'
        />
      </div>
    </>
  )
}
