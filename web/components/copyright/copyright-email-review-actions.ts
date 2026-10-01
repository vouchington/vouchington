import { useRef } from 'react'
import {
  approveCopyrightEmailIntake,
  admitCopyrightEmailCorrespondence,
  getCopyrightEmailIntake,
  listCopyrightEmailIntakes,
  rejectCopyrightEmailIntake,
  rejectCopyrightEmailCorrespondence,
  requestCopyrightEmailIntakeInformation,
  type CopyrightEmailIntake,
} from '@/lib/api/client/copyright-email-intakes'
import {
  createCopyrightEmailApprovalDraft,
  toCopyrightEmailApprovalInput,
  type CopyrightEmailApprovalDraft,
} from './copyright-email-approval-model'
import {
  createCopyrightEmailCorrespondenceDraft,
  toCopyrightEmailCorrespondenceInput,
  type CopyrightEmailCorrespondenceDraft,
} from './copyright-email-correspondence-model'
import {
  copyrightEmailActionError,
  copyrightEmailDecisionBasis,
  copyrightEmailReplyAddress,
  copyrightEmailReplyOutcome,
} from './copyright-email-review-decision'
import type { CopyrightEmailIntakeQueuePage } from '@/types/copyright-notices'

export function useCopyrightEmailReviewActions({
  correspondenceDraft,
  detail,
  draft,
  manualFallbackReason,
  rationale,
  replyEmail,
  setCorrespondenceDraft,
  setDetail,
  setDraft,
  setError,
  resetQueue,
  setLoading,
  setManualFallbackReason,
  setRationale,
  setReplyEmail,
  setSuccess,
}: {
  correspondenceDraft: CopyrightEmailCorrespondenceDraft
  detail: CopyrightEmailIntake | null
  draft: CopyrightEmailApprovalDraft | null
  manualFallbackReason: string
  rationale: string
  replyEmail: string
  setCorrespondenceDraft: (draft: CopyrightEmailCorrespondenceDraft) => void
  setDetail: (detail: CopyrightEmailIntake | null) => void
  setDraft: (draft: CopyrightEmailApprovalDraft | null) => void
  setError: (value: string | null) => void
  resetQueue: (page: CopyrightEmailIntakeQueuePage) => void
  setLoading: (value: boolean) => void
  setManualFallbackReason: (value: string) => void
  setRationale: (value: string) => void
  setReplyEmail: (value: string) => void
  setSuccess: (value: string | null) => void
}) {
  const selectedIntakeRequest = useRef(0)

  async function loadQueue() {
    resetQueue(await listCopyrightEmailIntakes())
  }
  async function selectIntake(intakeId: string) {
    const request = ++selectedIntakeRequest.current
    clearIntakeReviewState()
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
    } catch (error) {
      if (request === selectedIntakeRequest.current) {
        setError(copyrightEmailActionError(error, 'We could not load that copyright email intake.'))
      }
    } finally {
      if (request === selectedIntakeRequest.current) setLoading(false)
    }
  }
  async function approve() {
    if (!detail || !draft) return
    await complete(
      () =>
        approveCopyrightEmailIntake(detail.id, {
          ...toCopyrightEmailApprovalInput(draft),
          ...copyrightEmailDecisionBasis(detail, rationale, manualFallbackReason),
        }),
      'The structured intake was approved.',
      'We could not approve that copyright email intake.',
    )
  }
  async function reject() {
    if (!detail) return
    await complete(
      () =>
        rejectCopyrightEmailIntake(
          detail.id,
          rationale.trim(),
          detail.recommendation?.id ?? null,
          detail.recommendation ? null : manualFallbackReason.trim(),
          copyrightEmailReplyAddress(detail, replyEmail),
        ),
      response => `The email intake was rejected. ${copyrightEmailReplyOutcome(response)}`,
      'We could not reject that copyright email intake.',
    )
  }
  async function requestInformation(responseMessage: string) {
    if (!detail) return
    await complete(
      () =>
        requestCopyrightEmailIntakeInformation(detail.id, {
          ...copyrightEmailDecisionBasis(detail, rationale, manualFallbackReason),
          reply_email: copyrightEmailReplyAddress(detail, replyEmail),
          response_message: responseMessage.trim(),
        }),
      response => `The information request was recorded. ${copyrightEmailReplyOutcome(response)}`,
      'We could not request information for that copyright email intake.',
    )
  }
  async function admitCorrespondence() {
    if (!detail) return
    await complete(
      () =>
        admitCopyrightEmailCorrespondence(detail.id, {
          ...toCopyrightEmailCorrespondenceInput(correspondenceDraft),
          ...copyrightEmailDecisionBasis(detail, rationale, manualFallbackReason),
        }),
      'The matched email correspondence was admitted.',
      'We could not admit that copyright email correspondence.',
    )
  }
  async function rejectCorrespondence() {
    if (!detail) return
    await complete(
      () =>
        rejectCopyrightEmailCorrespondence(detail.id, {
          kind: correspondenceDraft.kind,
          ...copyrightEmailDecisionBasis(detail, rationale, manualFallbackReason),
        }),
      'The matched email correspondence was rejected.',
      'We could not reject that copyright email correspondence.',
    )
  }
  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null)
    setSuccess(null)
    setLoading(true)
    try {
      await action()
    } catch (error) {
      setError(copyrightEmailActionError(error, fallback))
    } finally {
      setLoading(false)
    }
  }
  async function complete<Result>(
    action: () => Promise<Result>,
    success: string | ((result: Result) => string),
    fallback: string,
  ) {
    await run(async () => {
      const result = await action()
      setDetail(null)
      setRationale('')
      setManualFallbackReason('')
      setReplyEmail('')
      await loadQueue()
      setSuccess(typeof success === 'string' ? success : success(result))
    }, fallback)
  }
  function clearIntakeReviewState() {
    setDetail(null)
    setDraft(null)
    setCorrespondenceDraft(createCopyrightEmailCorrespondenceDraft())
    setManualFallbackReason('')
    setRationale('')
    setReplyEmail('')
  }
  return {
    admitCorrespondence,
    approve,
    reject,
    rejectCorrespondence,
    requestInformation,
    selectIntake,
  }
}
