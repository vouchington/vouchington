'use client'

import { useId, useState, useTransition } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  issueAdminUserWarning,
  issueCommunityUserWarning,
  type IssueUserWarningResponse,
} from '@/lib/api/client/warnings'
import onError, { onSuccess } from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'

interface IssueWarningDialogProps {
  /** ID of the user to be warned. */
  userId: string
  /** When set, the warning is issued via the community route. */
  communitySlug?: string
  /** When set, the warning resolves this report ID automatically. */
  reportId?: string
  /** Called after a warning is successfully issued. */
  onIssued?: (result: IssueUserWarningResponse) => void
  /** Custom trigger element. Defaults to a labelled button. */
  children?: React.ReactNode
}

export function IssueWarningDialog({
  userId,
  communitySlug,
  reportId,
  onIssued,
  children,
}: IssueWarningDialogProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [publicMessage, setPublicMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const reasonId = useId()
  const publicMessageId = useId()

  function reset() {
    setReason('')
    setPublicMessage('')
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmedReason = reason.trim()
    if (!trimmedReason) return

    startTransition(async () => {
      try {
        const body = {
          userId,
          reason: trimmedReason,
          publicMessage: publicMessage.trim() || null,
          reportId: reportId ?? null,
          resolveReport: Boolean(reportId),
        }
        const result = communitySlug
          ? await issueCommunityUserWarning(communitySlug, body)
          : await issueAdminUserWarning(body)

        onSuccess(t('extracted.shared.issueWarningDialog.warningIssued_9d668dcb'))
        setOpen(false)
        reset()
        onIssued?.(result)
      } catch (error) {
        onError(error, {
          fallback: t('extracted.shared.issueWarningDialog.failedToIssueWarning_b967c829'),
        })
      }
    })
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    setOpen(next)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogTrigger asChild>
        {children !== undefined ? (
          children
        ) : (
          <Button
            variant='outline'
            size='touchSm'
            data-pw='issue-warning-trigger'
          >
            <AlertTriangle data-icon='inline-start' />
            {t('extracted.shared.issueWarningDialog.issueWarning_9814467b')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent data-pw='issue-warning-dialog'>
        <DialogHeader>
          <DialogTitle>
            {t('extracted.shared.issueWarningDialog.issueWarning_9814467b')}
          </DialogTitle>
          <DialogDescription>
            {t('extracted.shared.issueWarningDialog.sendAFormalWarningToThis_d17fb7ab')}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className='space-y-4'
        >
          <div className='space-y-1'>
            <Label htmlFor={reasonId}>
              {t('extracted.shared.issueWarningDialog.reason_f81ab834')}{' '}
              <span aria-hidden='true'>
                {t('extracted.shared.issueWarningDialog.text_684888c0')}
              </span>
            </Label>
            <Textarea
              id={reasonId}
              name='reason'
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={t(
                'extracted.shared.issueWarningDialog.internalReasonVisibleToModeratorsOnly_97967780',
              )}
              required
              maxLength={1000}
              disabled={isPending}
              data-pw='issue-warning-reason'
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor={publicMessageId}>
              {t('extracted.shared.issueWarningDialog.publicMessageOptional_af6b2b0b')}
            </Label>
            <Textarea
              id={publicMessageId}
              name='publicMessage'
              value={publicMessage}
              onChange={e => setPublicMessage(e.target.value)}
              placeholder={t(
                'extracted.shared.issueWarningDialog.messageShownToTheUserLeave_8eea7b1e',
              )}
              maxLength={2000}
              disabled={isPending}
              data-pw='issue-warning-public-message'
            />
          </div>
          <DialogFooter>
            <Button
              type='submit'
              loading={isPending}
              disabled={isPending || !reason.trim()}
              data-pw='issue-warning-submit'
            >
              {t('extracted.shared.issueWarningDialog.issueWarning_9814467b')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
