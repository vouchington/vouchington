'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { updateCommunityAutomodSettings } from '@/lib/api/client/community-automod'
import onError, { onSuccess } from '@/lib/on-error'
import type { Community, CommunityAutomodActionSetting } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'
import {
  COMMUNITY_AUTOMOD_ACTIONS,
  communityAutomodActionDescription,
  communityAutomodActionLabel,
  isCommunityAutomodActionSetting,
} from './community-automod-action-options'

interface CommunityAutomodActionFormProps {
  community: Pick<Community, 'slug' | 'automod_action'>
}

export function CommunityAutomodActionForm({ community }: CommunityAutomodActionFormProps) {
  const t = useTranslations()
  const router = useRouter()
  // oxlint-disable-next-line react-doctor/no-derived-useState -- form edits start from the server value; refresh remounts after save.
  const [action, setAction] = useState<CommunityAutomodActionSetting>(community.automod_action)
  const [isSaving, setIsSaving] = useState(false)
  const [isNavigating, startNavigation] = useTransition()
  const isBusy = isSaving || isNavigating

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isBusy) return

    setIsSaving(true)
    try {
      await updateCommunityAutomodSettings(community.slug, { automod_action: action })
      onSuccess(t('extracted.communities.communityAutomodActionForm.automodActionSaved_5a7127b1'))
      startNavigation(() => router.refresh())
    } catch (err) {
      onError(err, {
        fallback: t(
          'extracted.communities.communityAutomodActionForm.couldNotSaveTheAutomodAction_d095dea5',
        ),
        tags: { form: 'community-automod-action' },
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className='space-y-3 rounded-md border p-4'
      data-pw='community-automod-action-form'
    >
      <div>
        <h3 className='text-sm font-semibold'>
          {t('extracted.communities.communityAutomodActionForm.automodAction_83211784')}
        </h3>
        <p className='text-sm text-muted-foreground'>
          {t(
            'extracted.communities.communityAutomodActionForm.chooseWhatHappensToAPublishedPost_b2e29694',
          )}
        </p>
      </div>
      <RadioGroup
        value={action}
        onValueChange={value => {
          if (isCommunityAutomodActionSetting(value)) setAction(value)
        }}
        aria-label={t('extracted.communities.communityAutomodActionForm.automodAction_83211784')}
        disabled={isBusy}
      >
        {COMMUNITY_AUTOMOD_ACTIONS.map(option => (
          <div
            key={option}
            className='flex items-start gap-2'
          >
            <RadioGroupItem
              id={`community-automod-action-${option}`}
              value={option}
              className='mt-1'
              // oxlint-disable-next-line no-mistakes/playwright-literals -- static template over the finite automod action enum
              data-pw={`community-automod-action-${option}`}
            />
            <Label
              htmlFor={`community-automod-action-${option}`}
              className='cursor-pointer space-y-0.5 font-normal'
            >
              <span className='block font-medium'>{communityAutomodActionLabel(option, t)}</span>
              <span className='block text-xs text-muted-foreground'>
                {communityAutomodActionDescription(option, t)}
              </span>
            </Label>
          </div>
        ))}
      </RadioGroup>
      <Button
        type='submit'
        size='sm'
        loading={isBusy}
        disabled={isBusy || action === community.automod_action}
        data-pw='community-automod-action-save'
      >
        {isBusy
          ? t('extracted.communities.communityAutomodActionForm.saving_dc85af8f')
          : t('extracted.communities.communityAutomodActionForm.saveAutomodAction_5f2b209e')}
      </Button>
    </form>
  )
}
