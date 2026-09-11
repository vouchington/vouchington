'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  submitReport,
  type ReportableEntityType,
  type ReportReason,
} from '@/lib/api/client/reports'
import { ApiError } from '@/lib/api/error'
import { ReportDialogForm } from './report-dialog-form'
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { getReportStorageKey, getReportSubmittedKey, REPORT_SUBMITTED_EVENT } from './report-state'
import { useTranslations } from '@/lib/i18n/use-translations'

function hasAlreadyReported(entityType: ReportableEntityType, entityId: string) {
  try {
    return sessionStorage.getItem(getReportStorageKey(entityType, entityId)) === 'submitted'
  } catch {
    return false
  }
}

function markAsReported(entityType: ReportableEntityType, entityId: string) {
  const key = getReportStorageKey(entityType, entityId)
  try {
    sessionStorage.setItem(key, 'submitted')
  } catch {
    // ignore sessionStorage errors (e.g. in private browsing)
  }
  window.dispatchEvent(new CustomEvent(REPORT_SUBMITTED_EVENT, { detail: { key } }))
}

interface Props {
  entityType: ReportableEntityType
  entityId: string
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function ReportDialog({ entityType, entityId, open, onOpenChange }: Props) {
  const t = useTranslations()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(() => hasAlreadyReported(entityType, entityId))
  const [inlineError, setInlineError] = useState<string | null>(null)
  const turnstile = useTurnstileToken()

  useEffect(() => {
    const key = getReportStorageKey(entityType, entityId)
    const onReportSubmitted = (event: Event) => {
      if (getReportSubmittedKey(event) === key) setSuccess(true)
    }
    window.addEventListener(REPORT_SUBMITTED_EVENT, onReportSubmitted)
    return () => window.removeEventListener(REPORT_SUBMITTED_EVENT, onReportSubmitted)
  }, [entityId, entityType])

  function handleOpenChange(v: boolean) {
    if (v && hasAlreadyReported(entityType, entityId)) {
      setSuccess(true)
    }
    onOpenChange(v)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitting || !reason) return
    setInlineError(null)
    setSubmitting(true)
    let keepFormOpen = true
    try {
      await submitReport({
        entityType,
        entityId,
        reason,
        note: note.trim() || undefined,
        cf_turnstile_response: turnstile.token ?? undefined,
      })
      markAsReported(entityType, entityId)
      keepFormOpen = false
      setSuccess(true)
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        toast.error(t('extracted.shared.reportDialog.youAreReportingTooOftenPlease_c85f5e99'))
      } else if (error instanceof ApiError && (error.status === 404 || error.status === 422)) {
        setInlineError(error.message)
      } else {
        setInlineError(t('extracted.shared.reportDialog.failedToSubmitReportPleaseTry_88dbc422'))
      }
    } finally {
      if (keepFormOpen) {
        // The token was consumed by the backend's verification; get a fresh one
        // so the user can retry.
        turnstile.reset()
        setSubmitting(false)
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
    >
      <DialogContent data-pw='report-dialog'>
        <DialogHeader>
          <DialogTitle>{t('extracted.shared.reportDialog.reportContent_daca1b66')}</DialogTitle>
          <DialogDescription className='sr-only'>
            {t('extracted.shared.reportDialog.selectAReasonAndOptionallyAdd_5a44e32e')}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <p
            className='py-4 text-sm text-muted-foreground'
            data-pw='report-success-message'
          >
            {t('extracted.shared.reportDialog.reportSubmittedThankYouModeratorsWill_555866bf')}
          </p>
        ) : (
          <ReportDialogForm
            entityType={entityType}
            reason={reason}
            onSelectReason={setReason}
            note={note}
            onNoteChange={setNote}
            turnstile={turnstile}
            inlineError={inlineError}
            submitting={submitting}
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSubmit}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
