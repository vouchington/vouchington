import { recordClassifierRunAlarm } from '@modules/on-error'
import { StructuredDecisionError } from '@modules/structured-decisions'
import type { ClassifierRunFailureKind } from '@services/classifier-runs'

export type ClassifierRunFailure = {
  kind: ClassifierRunFailureKind
  /** The failure can never succeed on retry, so the run ends now rather than at its attempt cap. */
  permanent: boolean
}

type Phase = { reserved: boolean; returned: boolean }

/**
 * The one place a failed provider attempt becomes a receipt failure, shared by every classifier.
 * `null` means the failure is not the provider's and is not charged to the attempt.
 *
 * A provider failure is permanent exactly when the structured-decision client classified it so
 * (`retryClass`, from the status and the error body). A moderation block ends the run as
 * `context-rejected`; any other permanent rejection ends it as `provider-error`.
 */
export function classifyFailure(
  error: unknown,
  phase: Phase,
  signal: AbortSignal,
): ClassifierRunFailure | null {
  if (!phase.reserved) return null
  if (error instanceof StructuredDecisionError && error.code === 'invalid-response')
    return { kind: 'invalid-result', permanent: false }
  if (error instanceof StructuredDecisionError && error.code === 'provider-error') {
    if (error.retryClass !== 'permanent') return { kind: 'provider-error', permanent: false }
    return {
      kind: error.detail?.moderation ? 'context-rejected' : 'provider-error',
      permanent: true,
    }
  }
  // Once the provider has returned, an abort is not a provider failure: the response is already
  // billed, so only a defect in what came back may fail the attempt.
  if (signal.aborted && !phase.returned) return { kind: 'provider-error', permanent: false }
  return phase.returned ? { kind: 'invalid-result', permanent: false } : null
}

/**
 * Alarms a run the provider permanently rejected for a reason an operator can fix (a rejected key,
 * exhausted credits, a malformed request, a guardrail block). A moderation block is about the
 * content, not the deployment, and stays quiet. Only safe fields leave here.
 */
export function alarmPermanentProviderRejection(
  context: { classifier: string; runId: string },
  failure: ClassifierRunFailure,
  error: unknown,
): void {
  if (!failure.permanent || failure.kind === 'context-rejected') return
  if (!(error instanceof StructuredDecisionError)) return
  recordClassifierRunAlarm({
    kind: 'provider-rejected',
    ...context,
    status: error.status,
    providerCode: error.detail?.code,
    errorType: error.detail?.errorType,
  })
}
