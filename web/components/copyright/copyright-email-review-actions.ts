import {
  approveCopyrightEmailIntake,
  associateCopyrightEmailIntakeWithNotice,
  admitCopyrightEmailCorrespondence,
  listCopyrightEmailIntakes,
  rejectCopyrightEmailIntake,
  rejectCopyrightEmailCorrespondence,
  requestCopyrightEmailIntakeInformation,
  type CopyrightEmailIntake,
} from '@/lib/api/client/copyright-email-intakes'
import {
  toCopyrightEmailApprovalInput,
  type CopyrightEmailApprovalDraft,
} from './copyright-email-approval-model'
import {
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
import { useCopyrightEmailReviewSelection } from './copyright-email-review-selection'

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
  const selectIntake = useCopyrightEmailReviewSelection({
    setCorrespondenceDraft,
    setDetail,
    setDraft,
    setError,
    setLoading,
    setManualFallbackReason,
    setRationale,
    setReplyEmail,
    setSuccess,
  })

  async function loadQueue() {
    resetQueue(await listCopyrightEmailIntakes())
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
  async function associateWithNotice(noticeId: string) {
    if (!detail) return
    await complete(
      () => associateCopyrightEmailIntakeWithNotice(detail.id, noticeId),
      'The email intake was associated with the existing notice.',
      'We could not associate that email intake with the notice.',
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
    } catch (err) {
      setError(copyrightEmailActionError(err, fallback))
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
  return {
    associateWithNotice,
    admitCorrespondence,
    approve,
    reject,
    rejectCorrespondence,
    requestInformation,
    selectIntake,
  }
}
