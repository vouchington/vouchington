'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { updateMyUser } from '@/lib/api/client/users'
import onError from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'

export function HnDiscussionsPreference({
  initialEnabled,
  userId,
}: {
  initialEnabled: boolean
  userId: string
}) {
  const t = useTranslations()
  const [enabled, setEnabled] = useState(initialEnabled)
  const [pending, setPending] = useState(false)

  async function handleChange(nextEnabled: boolean) {
    if (nextEnabled === enabled || pending) return
    const previous = enabled
    setEnabled(nextEnabled)
    setPending(true)
    try {
      await updateMyUser(userId, { hn_discussions: nextEnabled })
      toast.success(t('extracted.my.preferencesForm.hackerNewsDiscussionsUpdated_0f9827b3'))
    } catch (error) {
      setEnabled(previous)
      onError(error, {
        fallback: t('extracted.my.privacyForm.failedToUpdatePrivacySetting_d08bc692'),
        tags: { form: 'my-preferences', field: 'hn_discussions' },
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className='flex items-start gap-4'>
      <Switch
        id='hn-discussions'
        checked={enabled}
        disabled={pending}
        onCheckedChange={handleChange}
        data-pw='preferences-hn-discussions-switch'
      />
      <div className='space-y-1'>
        <Label htmlFor='hn-discussions'>
          {t('extracted.my.preferencesForm.hackerNewsDiscussions_065664a4')}
        </Label>
        <p className='text-xs text-muted-foreground'>
          {t('extracted.my.preferencesForm.showRelatedHackerNewsThreadsWhen_00754911')}
        </p>
      </div>
    </div>
  )
}
