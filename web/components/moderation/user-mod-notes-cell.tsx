'use client'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { UserModNotesPanel } from './user-mod-notes-panel'
import { useTranslations } from '@/lib/i18n/use-translations'

export function UserModNotesControl({
  targetUserId,
  communityId,
}: {
  targetUserId: string | null
  communityId?: string | null
}) {
  const t = useTranslations()
  if (targetUserId === null) return null

  return (
    <Popover>
      <PopoverTrigger
        data-pw='user-mod-notes-trigger'
        className='cursor-pointer rounded text-xs underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        aria-label={t('extracted.moderation.userModNotesCell.viewModeratorNotes_c7c79aa4')}
      >
        {t('extracted.moderation.userModNotesCell.notes_8a7525b1')}
      </PopoverTrigger>
      <PopoverContent className='max-h-[min(80vh,32rem)] w-96 overflow-y-auto'>
        <UserModNotesPanel
          targetUserId={targetUserId}
          communityId={communityId}
        />
      </PopoverContent>
    </Popover>
  )
}

export function UserModNotesCell({
  targetUserId,
  communityId,
}: {
  targetUserId: string | null
  communityId?: string | null
}) {
  const t = useTranslations()
  if (targetUserId === null) {
    return (
      <td className='px-6 py-4 text-sm'>
        <span className='text-xs text-muted-foreground'>
          {t('extracted.moderation.userModNotesCell.text_bda05058')}
        </span>
      </td>
    )
  }
  return (
    <td className='px-6 py-4 text-sm'>
      <UserModNotesControl
        targetUserId={targetUserId}
        communityId={communityId}
      />
    </td>
  )
}
