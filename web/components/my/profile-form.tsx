'use client'

import { useState } from 'react'
import onError, { onSuccess } from '@/lib/on-error'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { updateMyProfile } from '@/lib/api/client'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  initialMarkdown: string
}

export function ProfileForm({ initialMarkdown }: Props) {
  const t = useTranslations()
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      await updateMyProfile({ markdown })
      onSuccess(t('extracted.my.profileForm.profileUpdated_9c5551e8'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.profileForm.failedToUpdateProfile_eeb7276d'),
        tags: { form: 'my-profile' },
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='space-y-4'>
      <h2 className='text-lg font-semibold'>{t('extracted.my.profileForm.about_4efca0d1')}</h2>
      <form
        onSubmit={handleSubmit}
        className='space-y-3'
      >
        <div className='space-y-1'>
          <Label htmlFor='markdown'>{t('extracted.my.profileForm.aboutMarkdown_ecf3894f')}</Label>
          <Textarea
            id='markdown'
            value={markdown}
            onChange={e => setMarkdown(e.target.value)}
            placeholder={t('extracted.my.profileForm.writeSomethingAboutYourself_497d2f3d')}
            className='min-h-32'
            dir='auto'
          />
        </div>
        <Button
          type='submit'
          loading={loading}
          disabled={loading}
          data-pw='profile-save-button'
        >
          {loading
            ? t('extracted.my.profileForm.saving_dc85af8f')
            : t('extracted.my.profileForm.saveProfile_0c8209e7')}
        </Button>
      </form>
    </div>
  )
}
