'use client'

import { Button } from '@/components/ui/button'
import type { CommunitySettingsFormState } from './use-community-settings-form'
import { useTranslations } from '@/lib/i18n/use-translations'

type CommunityDangerZoneProps = Pick<
  CommunitySettingsFormState,
  'confirmArchive' | 'error' | 'handleArchive' | 'isArchived' | 'isBusy' | 'loading'
>

export function CommunityDangerZone(props: CommunityDangerZoneProps) {
  const t = useTranslations()
  return (
    <div className='rounded-md border border-destructive/50 p-6'>
      <h2
        className='mb-2 text-lg font-semibold text-destructive'
        data-pw='community-danger-zone-heading'
      >
        {t('extracted.communities.communityDangerZone.dangerZone_3c1c01b4')}
      </h2>
      <p className='mb-4 text-sm text-muted-foreground'>
        {props.isArchived
          ? 'Restoring a community makes it writable again.'
          : 'Archiving a community makes it read-only.'}
      </p>
      {props.error && (
        <div
          className='mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive'
          role='alert'
        >
          {props.error}
        </div>
      )}
      <Button
        variant='destructive'
        loading={props.loading && props.confirmArchive}
        disabled={props.isBusy}
        onClick={props.handleArchive}
        data-pw='community-archive-button'
      >
        {props.loading && props.confirmArchive
          ? props.isArchived
            ? 'Restoring...'
            : 'Archiving...'
          : props.confirmArchive
            ? props.isArchived
              ? 'Confirm Restore'
              : 'Confirm Archive'
            : props.isArchived
              ? 'Restore Community'
              : 'Archive Community'}
      </Button>
    </div>
  )
}
