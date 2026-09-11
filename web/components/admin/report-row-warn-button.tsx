'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IssueWarningDialog } from '@/components/shared/issue-warning-dialog'
import type { IssueUserWarningResponse } from '@/lib/api/client/warnings'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ReportRowWarnButtonProps {
  /** User ID to warn — typically the owner of the reported entity. */
  userId: string
  reportId: string
  disabled?: boolean
  onIssued?: (result: IssueUserWarningResponse) => void
}

export function ReportRowWarnButton({
  userId,
  reportId,
  disabled = false,
  onIssued,
}: ReportRowWarnButtonProps) {
  const t = useTranslations()
  return (
    <IssueWarningDialog
      userId={userId}
      reportId={reportId}
      onIssued={onIssued}
    >
      <Button
        size='touchSm'
        variant='outline'
        disabled={disabled}
        data-pw='report-row-warn-button'
        aria-label={t('extracted.admin.reportRowWarnButton.issueWarningToUserFromThis_56acc226')}
      >
        <AlertTriangle className='size-4' />
        {t('extracted.admin.reportRowWarnButton.warn_8448814d')}
      </Button>
    </IssueWarningDialog>
  )
}
