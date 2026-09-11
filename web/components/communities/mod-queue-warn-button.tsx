'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IssueWarningDialog } from '@/components/shared/issue-warning-dialog'
import type { IssueUserWarningResponse } from '@/lib/api/client/warnings'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ModQueueWarnButtonProps {
  /** User ID to warn. */
  userId: string
  communitySlug: string
  reportId?: string
  disabled?: boolean
  onIssued?: (result: IssueUserWarningResponse) => void
}

export function ModQueueWarnButton({
  userId,
  communitySlug,
  reportId,
  disabled = false,
  onIssued,
}: ModQueueWarnButtonProps) {
  const t = useTranslations()
  return (
    <IssueWarningDialog
      userId={userId}
      communitySlug={communitySlug}
      reportId={reportId}
      onIssued={onIssued}
    >
      <Button
        size='sm'
        variant='outline'
        disabled={disabled}
        data-pw='mod-queue-warn-button'
        aria-label={t('extracted.communities.modQueueWarnButton.issueWarningToUser_d47d5f35')}
      >
        <AlertTriangle className='size-4' />
        {t('extracted.communities.modQueueWarnButton.warn_8448814d')}
      </Button>
    </IssueWarningDialog>
  )
}
