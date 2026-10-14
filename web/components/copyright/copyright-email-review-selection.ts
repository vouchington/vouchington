import { useRef } from 'react'
import {
  getCopyrightEmailIntake,
  type CopyrightEmailIntake,
} from '@/lib/api/client/copyright-email-intakes'
import {
  createCopyrightEmailApprovalDraft,
  type CopyrightEmailApprovalDraft,
} from './copyright-email-approval-model'
import {
  createCopyrightEmailCorrespondenceDraft,
  type CopyrightEmailCorrespondenceDraft,
} from './copyright-email-correspondence-model'
import { copyrightEmailActionError } from './copyright-email-review-decision'

export function useCopyrightEmailReviewSelection({
  setCorrespondenceDraft,
  setDetail,
  setDraft,
  setError,
  setLoading,
  setManualFallbackReason,
  setRationale,
  setReplyEmail,
  setSuccess,
}: {
  setCorrespondenceDraft: (draft: CopyrightEmailCorrespondenceDraft) => void
  setDetail: (detail: CopyrightEmailIntake | null) => void
  setDraft: (draft: CopyrightEmailApprovalDraft | null) => void
  setError: (value: string | null) => void
  setLoading: (value: boolean) => void
  setManualFallbackReason: (value: string) => void
  setRationale: (value: string) => void
  setReplyEmail: (value: string) => void
  setSuccess: (value: string | null) => void
}) {
  const selectedIntakeRequest = useRef(0)

  return async function selectIntake(intakeId: string) {
    const request = ++selectedIntakeRequest.current
    setDetail(null)
    setDraft(null)
    setCorrespondenceDraft(createCopyrightEmailCorrespondenceDraft())
    setManualFallbackReason('')
    setRationale('')
    setReplyEmail('')
    setError(null)
    setSuccess(null)
    setLoading(true)
    try {
      const response = await getCopyrightEmailIntake(intakeId)
      if (request !== selectedIntakeRequest.current) return
      setDetail(response.copyright_email_intake)
      setDraft(
        createCopyrightEmailApprovalDraft(
          response.copyright_email_intake.recommendation?.structured_output,
        ),
      )
    } catch (err) {
      if (request === selectedIntakeRequest.current) {
        setError(copyrightEmailActionError(err, 'We could not load that copyright email intake.'))
      }
    } finally {
      if (request === selectedIntakeRequest.current) setLoading(false)
    }
  }
}
