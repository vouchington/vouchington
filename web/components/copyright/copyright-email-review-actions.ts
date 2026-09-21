import { useRef } from 'react'
import {
  approveCopyrightEmailIntake,
  admitCopyrightEmailCorrespondence,
  getCopyrightEmailIntake,
  listCopyrightEmailIntakes,
  rejectCopyrightEmailIntake,
  rejectCopyrightEmailCorrespondence,
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

type QueueItem = {
  id: string
  received_at: string
  review_path?: 'initial' | 'unresolved_thread' | 'matched_thread'
}

export function useCopyrightEmailReviewActions({
  correspondenceDraft,
  detail,
  draft,
  manualFallbackReason,
  rationale,
  setCorrespondenceDraft,
  setDetail,
  setDraft,
  setError,
  setItems,
  setLoading,
  setManualFallbackReason,
  setRationale,
  setSuccess,
}: {
  correspondenceDraft: CopyrightEmailCorrespondenceDraft
  detail: CopyrightEmailIntake | null
  draft: CopyrightEmailApprovalDraft | null
  manualFallbackReason: string
  rationale: string
  setCorrespondenceDraft: (draft: CopyrightEmailCorrespondenceDraft) => void
  setDetail: (detail: CopyrightEmailIntake | null) => void
  setDraft: (draft: CopyrightEmailApprovalDraft | null) => void
  setError: (value: string | null) => void
  setItems: (items: QueueItem[]) => void
  setLoading: (value: boolean) => void
  setManualFallbackReason: (value: string) => void
  setRationale: (value: string) => void
  setSuccess: (value: string | null) => void
}) {
  const selectedIntakeRequest = useRef(0)

  async function loadQueue() {
    setItems((await listCopyrightEmailIntakes()).copyright_email_intakes)
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
        setError(displayError(error, 'We could not load that copyright email intake.'))
      }
    } finally {
      if (request === selectedIntakeRequest.current) setLoading(false)
    }
  }
  async function approve() {
    if (!detail || !draft) return
    await complete(
      async () => {
        await approveCopyrightEmailIntake(detail.id, {
          ...toCopyrightEmailApprovalInput(draft),
          rationale: rationale.trim(),
          recommendation_id: detail.recommendation?.id ?? null,
          manual_fallback_reason: detail.recommendation ? null : manualFallbackReason.trim(),
        })
      },
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
        ),
      'The email intake was rejected.',
      'We could not reject that copyright email intake.',
    )
  }
  async function admitCorrespondence() {
    if (!detail) return
    await complete(
      () =>
        admitCopyrightEmailCorrespondence(detail.id, {
          ...toCopyrightEmailCorrespondenceInput(correspondenceDraft),
          rationale: rationale.trim(),
          recommendation_id: detail.recommendation?.id ?? null,
          manual_fallback_reason: detail.recommendation ? null : manualFallbackReason.trim(),
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
          rationale: rationale.trim(),
          recommendation_id: detail.recommendation?.id ?? null,
          manual_fallback_reason: detail.recommendation ? null : manualFallbackReason.trim(),
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
      setError(displayError(error, fallback))
    } finally {
      setLoading(false)
    }
  }
  async function complete(action: () => Promise<unknown>, success: string, fallback: string) {
    await run(async () => {
      await action()
      setDetail(null)
      setRationale('')
      setManualFallbackReason('')
      await loadQueue()
      setSuccess(success)
    }, fallback)
  }
  function clearIntakeReviewState() {
    setDetail(null)
    setDraft(null)
    setCorrespondenceDraft(createCopyrightEmailCorrespondenceDraft())
    setManualFallbackReason('')
    setRationale('')
  }
  return { admitCorrespondence, approve, reject, rejectCorrespondence, selectIntake }
}

function displayError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}
