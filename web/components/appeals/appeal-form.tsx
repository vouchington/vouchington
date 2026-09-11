'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { createModerationAppeal } from '@/lib/api/client/appeals'
import onError, { onSuccess } from '@/lib/on-error'
import { useTranslations } from '@/lib/i18n/use-translations'
import { APPEAL_REASONS, type AppealReason } from './appeal-reasons'

type ValidationError = { field: 'reason' | 'statement'; message: string }

const validationErrorId = 'appeal-form-validation-error'

interface AppealFormProps {
  targetType: 'warning' | 'ban' | 'removal' | 'suspension'
  targetId?: string
  postRemovalKind?: 'platform' | 'community'
  onSuccess?: () => void
}

export function AppealForm({
  targetType,
  targetId,
  postRemovalKind,
  onSuccess: onSuccessProp,
}: AppealFormProps) {
  const t = useTranslations()
  const router = useRouter()
  const [reason, setReason] = useState<AppealReason | ''>('')
  const [statement, setStatement] = useState('')
  const [validationError, setValidationError] = useState<ValidationError | null>(null)
  const [isPending, startPending] = useTransition()
  const [isRefreshing, startRefreshing] = useTransition()
  const turnstile = useTurnstileToken()

  async function handleSubmit() {
    if (isPending || isRefreshing) return
    const trimmedStatement = statement.trim()
    if (!reason) {
      setValidationError({
        field: 'reason',
        message: t('extracted.appeals.appealForm.pleaseSelectAReason_c1776fc7'),
      })
      return
    }
    if (trimmedStatement.length === 0) {
      setValidationError({
        field: 'statement',
        message: t('extracted.appeals.appealForm.pleaseProvideAStatement_224dea3d'),
      })
      return
    }
    if (trimmedStatement.length > 3800) {
      setValidationError({
        field: 'statement',
        message: t('extracted.appeals.appealForm.statementMustBe3800Characters_a7d6b03f'),
      })
      return
    }
    setValidationError(null)

    const reasonLabel = APPEAL_REASONS.find(r => r.value === reason)?.label ?? reason
    const appealReason = `[${reasonLabel}] ${trimmedStatement}`

    startPending(async () => {
      try {
        const result = await createModerationAppeal({
          target_type: targetType,
          ...(targetId ? { target_id: targetId } : {}),
          ...(postRemovalKind ? { post_removal_kind: postRemovalKind } : {}),
          appeal_reason: appealReason,
          cf_turnstile_response: turnstile.token ?? undefined,
        })
        if (result.isDuplicate) {
          onSuccess(t('extracted.appeals.appealForm.youAlreadyHaveAPendingAppeal_f6354d0e'))
        } else {
          onSuccess(t('extracted.appeals.appealForm.appealSubmittedYouWillBeNotified_e79910fb'))
        }
        onSuccessProp?.()
        startRefreshing(() => router.refresh())
      } catch (error) {
        onError(error, {
          fallback: t('extracted.appeals.appealForm.failedToSubmitAppeal_b909cc9f'),
          tags: { form: 'appeal-form' },
        })
        // The backend consumed the token during verification; reset so the user can retry.
        turnstile.reset()
      }
    })
  }

  const disabled = isPending || isRefreshing
  const isReasonInvalid = validationError?.field === 'reason'
  const isStatementInvalid = validationError?.field === 'statement'

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        void handleSubmit()
      }}
      data-pw='appeal-form'
      className='space-y-4'
    >
      <div className='space-y-1.5'>
        <Label htmlFor='appeal-reason-select'>
          {t('extracted.appeals.appealForm.reason_f81ab834')}
        </Label>
        <Select
          value={reason}
          onValueChange={value => {
            setReason(value as AppealReason)
            if (validationError?.field === 'reason') {
              setValidationError(null)
            }
          }}
          disabled={disabled}
        >
          <SelectTrigger
            id='appeal-reason-select'
            aria-invalid={isReasonInvalid ? 'true' : undefined}
            aria-describedby={isReasonInvalid ? validationErrorId : undefined}
          >
            <SelectValue placeholder={t('extracted.appeals.appealForm.selectAReason_fb82dac1')} />
          </SelectTrigger>
          <SelectContent>
            {APPEAL_REASONS.map(r => (
              <SelectItem
                key={r.value}
                value={r.value}
                // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from appeal reason value
                data-pw={`appeal-reason-option-${r.value}`}
              >
                {t(r.messageKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-1.5'>
        <Label htmlFor='appeal-statement'>
          {t('extracted.appeals.appealForm.statement_6171b2a4')}
        </Label>
        <Textarea
          id='appeal-statement'
          value={statement}
          onChange={e => {
            setStatement(e.target.value)
            if (validationError?.field === 'statement') {
              setValidationError(null)
            }
          }}
          placeholder={t('extracted.appeals.appealForm.explainWhyThisDecisionShouldBe_a49a7667')}
          rows={5}
          disabled={disabled}
          aria-invalid={isStatementInvalid ? 'true' : undefined}
          aria-describedby={isStatementInvalid ? validationErrorId : undefined}
        />
      </div>

      <TurnstileField turnstile={turnstile} />

      {validationError ? (
        <p
          id={validationErrorId}
          role='alert'
          className='text-sm text-destructive'
          data-pw='appeal-form-validation-error'
        >
          {validationError.message}
        </p>
      ) : null}

      <Button
        type='submit'
        size='touch'
        disabled={disabled || !turnstile.token}
        loading={isPending}
        data-pw='appeal-submit-button'
      >
        {isPending
          ? t('extracted.appeals.appealForm.submitting_49195f55')
          : t('extracted.appeals.appealForm.submitAppeal_86efa243')}
      </Button>
    </form>
  )
}
