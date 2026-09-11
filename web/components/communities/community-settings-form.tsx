'use client'

import { Button } from '@/components/ui/button'
import type { Community } from '@/types/api-responses'
import { CommunityDangerZone } from './community-danger-zone'
import { CommunitySettingsFields } from './community-settings-fields'
import { useCommunitySettingsForm } from './use-community-settings-form'
import { useTranslations } from '@/lib/i18n/use-translations'

interface CommunitySettingsFormProps {
  community: Community
}

export function CommunitySettingsForm({ community }: CommunitySettingsFormProps) {
  const t = useTranslations()
  const form = useCommunitySettingsForm(community)

  return (
    <div className='space-y-8'>
      <form
        onSubmit={form.handleSubmit}
        className='space-y-4'
      >
        {form.error && (
          <div className='rounded-md bg-destructive/10 p-3 text-sm text-destructive'>
            {form.error}
          </div>
        )}
        {form.success && (
          <div
            className='rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-300'
            data-pw='community-settings-success'
          >
            {t('extracted.communities.communitySettingsForm.settingsSavedSuccessfully_2bbea710')}
          </div>
        )}

        <CommunitySettingsFields {...form} />

        <Button
          type='submit'
          loading={form.isBusy}
          disabled={form.isBusy}
          data-pw='community-settings-save-button'
        >
          {form.isBusy ? 'Saving...' : 'Save Settings'}
        </Button>
      </form>

      <CommunityDangerZone {...form} />
    </div>
  )
}
