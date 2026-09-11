'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TurnstileField } from '@/components/shared/turnstile-field'
import type { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { useTranslations } from '@/lib/i18n/use-translations'

const DISPUTE_REASONS = [
  {
    value: 'factually_inaccurate',
    labelKey: 'extracted.disputes.disputeForm.factuallyInaccurate_d5e5ace7',
  },
  { value: 'defamatory', labelKey: 'extracted.disputes.disputeForm.defamatory_171d85c2' },
  { value: 'impersonation', labelKey: 'extracted.disputes.disputeForm.impersonation_05955157' },
  {
    value: 'privacy_violation',
    labelKey: 'extracted.disputes.disputeForm.privacyViolation_a9d167e4',
  },
  { value: 'other', labelKey: 'extracted.disputes.disputeForm.other_f97e9da0' },
] as const

interface DisputeFormProps {
  submitted: boolean
  reason: string
  claimText: string
  loading: boolean
  error: string | null
  turnstile: ReturnType<typeof useTurnstileToken>
  onReasonChange: (v: string) => void
  onClaimTextChange: (v: string) => void
  onSubmit: (e: { preventDefault: () => void }) => void
  onClose: () => void
}

export function DisputeForm({
  submitted,
  reason,
  claimText,
  loading,
  error,
  turnstile,
  onReasonChange,
  onClaimTextChange,
  onSubmit,
  onClose,
}: DisputeFormProps) {
  const t = useTranslations()
  if (submitted) {
    return (
      <div
        className='space-y-3'
        data-pw='dispute-submitted'
      >
        <p className='text-sm text-green-700'>
          {t('extracted.disputes.disputeForm.yourDisputeHasBeenSubmittedAnd_33859595')}{' '}
          <Link
            href='/my/disputes'
            className='underline'
          >
            {t('extracted.disputes.disputeForm.myDisputes_5f61fead')}
          </Link>
          {t('extracted.disputes.disputeForm.text_cdb4ee2a')}
        </p>
        <Button onClick={onClose}>{t('extracted.disputes.disputeForm.close_7d9eb7ac')}</Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className='space-y-4'
      data-pw='dispute-form'
    >
      <div className='space-y-1'>
        <Label htmlFor='dispute-reason'>
          {t('extracted.disputes.disputeForm.reason_f81ab834')}
        </Label>
        <Select
          value={reason}
          onValueChange={onReasonChange}
          required
        >
          <SelectTrigger
            id='dispute-reason'
            data-pw='dispute-reason-select'
          >
            <SelectValue placeholder={t('extracted.disputes.disputeForm.selectAReason_8f60b865')} />
          </SelectTrigger>
          <SelectContent>
            {DISPUTE_REASONS.map(r => (
              <SelectItem
                key={r.value}
                value={r.value}
              >
                {t(r.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className='space-y-1'>
        <Label htmlFor='claim-text'>{t('extracted.disputes.disputeForm.yourClaim_d9122523')}</Label>
        <Textarea
          id='claim-text'
          value={claimText}
          onChange={e => onClaimTextChange(e.target.value)}
          placeholder={t('extracted.disputes.disputeForm.explainWhyThisReviewShouldBe_880580dc')}
          rows={4}
          maxLength={4000}
          required
          data-pw='claim-text'
        />
        <p className='text-xs text-muted-foreground'>
          {t('extracted.disputes.disputeForm.countMax_8596086d', {
            count: claimText.length,
            max: 4000,
          })}
        </p>
      </div>
      <TurnstileField turnstile={turnstile} />
      {error ? <p className='text-sm text-destructive'>{error}</p> : null}
      <div className='flex gap-2'>
        <Button
          type='submit'
          loading={loading}
          disabled={loading || !reason || !claimText.trim() || !turnstile.token}
          data-pw='dispute-submit'
        >
          {loading
            ? t('extracted.disputes.disputeForm.submitting_64115d5b')
            : t('extracted.disputes.disputeForm.submitDispute_4562c32e')}
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={onClose}
        >
          {t('extracted.disputes.disputeForm.cancel_19766ed6')}
        </Button>
      </div>
    </form>
  )
}
