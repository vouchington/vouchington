'use client'

import { useState, useTransition, type FormEvent, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import * as refundAttemptStorage from './membership-refund-attempt.ts'
import { createRefundRequest } from './membership-refund-request.ts'
import type { MembershipRefundFormState } from './membership-refund-form.types.ts'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import type { RefundableCharge } from '@/types/api-responses'

export function useMembershipRefundSubmission(options: {
  actorUserId: string
  userId: string
  selectedCharge: RefundableCharge
  formState: MembershipRefundFormState
  cancellationPending: boolean
  attemptRef: RefObject<refundAttemptStorage.MembershipRefundAttempt | null>
  setCancellationPending: (value: boolean) => void
  resetForm: () => void
  onReload: () => void
}) {
  const {
    actorUserId,
    userId,
    selectedCharge,
    formState,
    cancellationPending,
    attemptRef,
    setCancellationPending,
    resetForm,
    onReload,
  } = options
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const { refresh } = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const attemptScope = { actorUserId, targetUserId: userId }

  function finishTerminalRefundAttempt() {
    refundAttemptStorage.clearMembershipRefundAttempt(attemptScope)
    attemptRef.current = null
    setCancellationPending(false)
    resetForm()
    startTransition(() => refresh())
    onReload()
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      const request =
        cancellationPending && attemptRef.current
          ? attemptRef.current.request
          : createRefundRequest(userId, selectedCharge, formState, uiLocale)
      const attempt = refundAttemptStorage.prepareMembershipRefundAttempt(
        attemptScope,
        attemptRef.current,
        request,
        cancellationPending,
      )
      attemptRef.current = attempt
      const response = await refundAttemptStorage.submitMembershipRefundAttempt(attempt)
      switch (response.cancellation_status) {
        case 'pending':
          attemptRef.current = refundAttemptStorage.persistPendingRefundAttempt(
            attemptScope,
            attempt,
          )
          setCancellationPending(true)
          toast.warning(
            t('extracted.admin.membershipRefundForm.refundIssuedButAccessCouldNot_0b772f31'),
          )
          return
        case 'completed':
          toast.success(
            t('extracted.admin.membershipRefundForm.refundIssuedAndAccessRevoked_7d3e9a41'),
          )
          finishTerminalRefundAttempt()
          return
        case 'not_requested':
          toast.success(t('extracted.admin.membershipRefundForm.goodwillRefundIssued_2b6f1c90'))
          finishTerminalRefundAttempt()
          return
        default: {
          const unsupportedStatus: never = response.cancellation_status
          throw new Error(`Unsupported refund cancellation status: ${unsupportedStatus}`)
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('extracted.admin.membershipRefundForm.failedToIssueRefund_9a1c4e77'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }
  return { handleSubmit, isBusy: isPending || isSubmitting }
}
