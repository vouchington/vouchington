'use client'

import {
  useCallback,
  useEffect,
  useState,
  useTransition,
  type FormEvent,
  type RefObject,
} from 'react'
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
  reconciliationRetryAt: number | null
  attemptRef: RefObject<refundAttemptStorage.MembershipRefundAttempt | null>
  setReconciliationRetryAt: (value: number | null) => void
  resetForm: () => void
  onReload: () => void
}) {
  const {
    actorUserId,
    userId,
    selectedCharge,
    formState,
    reconciliationRetryAt,
    attemptRef,
    setReconciliationRetryAt,
    resetForm,
    onReload,
  } = options
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const { refresh } = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const finishTerminalRefundAttempt = useCallback(() => {
    refundAttemptStorage.clearMembershipRefundAttempt({ actorUserId, targetUserId: userId })
    attemptRef.current = null
    setReconciliationRetryAt(null)
    resetForm()
    startTransition(() => refresh())
    onReload()
  }, [actorUserId, attemptRef, onReload, refresh, resetForm, setReconciliationRetryAt, userId])

  const submitAttempt = useCallback(
    async (attempt: refundAttemptStorage.MembershipRefundAttempt) => {
      setIsSubmitting(true)
      try {
        const response = await refundAttemptStorage.submitMembershipRefundAttempt(attempt)
        if (response.outcome === 'reconciling') {
          const pendingAttempt = refundAttemptStorage.persistPendingRefundAttempt(
            { actorUserId, targetUserId: userId },
            attempt,
            response.retry_after_seconds,
          )
          attemptRef.current = pendingAttempt
          setReconciliationRetryAt(pendingAttempt.reconciliationRetryAt)
          if (reconciliationRetryAt === null) {
            toast.warning(
              t(
                'extracted.admin.membershipRefundForm.refundReconciliationIsContinuingAutomatically_c4dc814d',
              ),
            )
          }
          return
        }
        switch (response.cancellation_status) {
          case 'pending': {
            const pendingAttempt = refundAttemptStorage.persistPendingRefundAttempt(
              { actorUserId, targetUserId: userId },
              attempt,
              300,
            )
            attemptRef.current = pendingAttempt
            setReconciliationRetryAt(pendingAttempt.reconciliationRetryAt)
            if (reconciliationRetryAt === null) {
              toast.warning(
                t(
                  'extracted.admin.membershipRefundForm.refundReconciliationIsContinuingAutomatically_c4dc814d',
                ),
              )
            }
            return
          }
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
        if (attempt.reconciliationRetryAt !== null) {
          const pendingAttempt = refundAttemptStorage.persistPendingRefundAttempt(
            { actorUserId, targetUserId: userId },
            attempt,
            300,
          )
          attemptRef.current = pendingAttempt
          setReconciliationRetryAt(pendingAttempt.reconciliationRetryAt)
        }
        toast.error(
          error instanceof Error
            ? error.message
            : t('extracted.admin.membershipRefundForm.failedToIssueRefund_9a1c4e77'),
        )
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      attemptRef,
      actorUserId,
      finishTerminalRefundAttempt,
      reconciliationRetryAt,
      setReconciliationRetryAt,
      t,
      userId,
    ],
  )

  useEffect(() => {
    const attempt = attemptRef.current
    if (reconciliationRetryAt === null || !attempt) return
    const timer = window.setTimeout(
      () => {
        setReconciliationRetryAt(null)
        void submitAttempt(attempt)
      },
      Math.max(0, reconciliationRetryAt - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [attemptRef, reconciliationRetryAt, setReconciliationRetryAt, submitAttempt])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (reconciliationRetryAt !== null) return
    const request = createRefundRequest(userId, selectedCharge, formState, uiLocale)
    const attempt = refundAttemptStorage.prepareMembershipRefundAttempt(
      { actorUserId, targetUserId: userId },
      attemptRef.current,
      request,
      null,
    )
    attemptRef.current = attempt
    await submitAttempt(attempt)
  }
  return { handleSubmit, isBusy: isPending || isSubmitting }
}
