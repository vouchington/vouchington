'use client'

import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ReportableEntityType, ReportReason } from '@/lib/api/client/reports'
import type { UseTurnstileTokenReturn } from '@/hooks/use-turnstile-token'
import { ReportReasonFieldset } from './report-reason-fieldset'
import { TurnstileField } from './turnstile-field'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ReportDialogFormProps {
  entityType: ReportableEntityType
  reason: ReportReason | null
  onSelectReason: (reason: ReportReason) => void
  note: string
  onNoteChange: (value: string) => void
  turnstile: UseTurnstileTokenReturn
  inlineError: string | null
  submitting: boolean
  onCancel: () => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
}

export function ReportDialogForm({
  entityType,
  reason,
  onSelectReason,
  note,
  onNoteChange,
  turnstile,
  inlineError,
  submitting,
  onCancel,
  onSubmit,
}: ReportDialogFormProps) {
  const t = useTranslations()
  return (
    <form
      onSubmit={onSubmit}
      className='space-y-4'
    >
      <ReportReasonFieldset
        entityType={entityType}
        reason={reason}
        onSelect={onSelectReason}
      />

      <div className='space-y-1'>
        <Label
          htmlFor='report-note'
          className='text-sm font-medium'
        >
          {t('extracted.shared.reportDialog.additionalNote_d16bdfd8')}{' '}
          <span className='font-normal text-muted-foreground'>
            {t('extracted.shared.reportDialog.optional_0059798b')}
          </span>
        </Label>
        <Textarea
          id='report-note'
          value={note}
          onChange={e => onNoteChange(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder={t('extracted.shared.reportDialog.describeTheIssue_b94158da')}
        />
      </div>

      <TurnstileField turnstile={turnstile} />

      {inlineError ? (
        <p
          role='alert'
          className='text-sm text-destructive'
        >
          {inlineError}
        </p>
      ) : null}

      <DialogFooter>
        <Button
          type='button'
          variant='outline'
          onClick={onCancel}
          disabled={submitting}
          data-pw='report-cancel'
        >
          {t('extracted.shared.reportDialog.cancel_19766ed6')}
        </Button>
        <Button
          type='submit'
          data-pw='report-submit'
          loading={submitting}
          disabled={submitting || !reason || !turnstile.token}
        >
          {submitting
            ? t('extracted.shared.reportDialog.submitting_49195f55')
            : t('extracted.shared.reportDialog.submitReport_b41fd589')}
        </Button>
      </DialogFooter>
    </form>
  )
}
