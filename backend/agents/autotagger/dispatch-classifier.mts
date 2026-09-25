import {
  applyTopicClassifierDecisionVotes,
  getActiveClassifierConfigurationBySlugFromPrimary,
  readCompleteClassifierDecisionIfExistsFromPrimary,
} from '@services/classifiers'
import {
  claimAutotaggerReceipt,
  completeAutotaggerReceipt,
  AUTOTAGGER_RECEIPT_DIGEST_VERSION,
  type AutotaggerReceiptSubject,
} from '@services/autotagger'
import { createStructuredDecisionClient } from '@modules/structured-decisions'
import type { ClassifierSafeText } from '@agents/classifiers/safe-content'
import type { ClassifierModelProvider } from '@voucha/types'
import { getAutotaggerClassifierSystemUserId } from '@services/users/system-users'
import { executeAndPersistAutotaggerDecision } from './dispatch-classifier-execute.mts'
import { buildAutotaggerClassifierBindingsAndDigest } from './dispatch-classifier-bindings.mts'

const TAGGING_CLASSIFIER_SLUG = 'tagging'

/**
 * The seeded `tagging` classifier is always `openrouter` (0635-00-02-seed-tagging-classifier.mts).
 * `ClassifierModelProvider` is a wider union shared with classifiers this dispatch path never
 * reads, so an operator reconfiguring the active prompt version to `typesafe` throws here directly,
 * before any receipt is claimed. For the `openrouter` branch itself, an unset/empty
 * `OPENROUTER_API_KEY` is NOT rejected here -- this function only resolves the string.
 * `createStructuredDecisionClient` (called immediately after, still before any receipt is claimed)
 * is what throws `StructuredDecisionError('invalid-request', ...)` on an empty key
 * (backend/modules/structured-decisions/client.mts), so the "fail loudly before claiming a receipt"
 * guarantee still holds end to end -- it just isn't this function's own job.
 *
 * Exported for direct unit testing of both branches without touching the real seeded `tagging`
 * classifier's provider, which is a singleton row shared by every concurrent test worker.
 */
export function resolveStructuredDecisionApiKey(transport: ClassifierModelProvider): string {
  if (transport === 'openrouter') return process.env.OPENROUTER_API_KEY ?? ''
  throw new Error(
    `Autotagger classifier dispatch has no API key source for provider '${transport}'`,
  )
}

// The structured-decision client's own retry budget is 3 attempts with sleeps capped at 5s
// between them (backend/modules/structured-decisions/client.mts); it has no per-request timeout
// of its own, so the dispatch AbortSignal (dispatch-classifier-execute.mts) is the only thing
// bounding a stalled provider call. 60s covers that worst case with headroom; the dispatch signal
// fires 5s early so an aborted request still leaves room to record the failure before the lease
// itself would expire.
export const AUTOTAGGER_CLASSIFIER_LEASE_SECONDS = 60

export type AutotaggerClassifierCandidate = { topicId: string; name: string }

export type AutotaggerClassifierDispatchInput = {
  subject: AutotaggerReceiptSubject
  state: ClassifierSafeText
  candidates: readonly AutotaggerClassifierCandidate[]
  // The resolved tier/discoverability cap the caller used to bound its candidate search -- kept
  // distinct from `candidates.length` because the digest must change when this cap changes even if
  // the *found* candidate set happens to stay identical (e.g. a plan upgrade raising the cap from 3
  // to 10 while embedding search still only turns up the same 2 topics must still be treated as a
  // new request, not a replay of the free-tier decision).
  maxCandidates: number
}

export type AutotaggerClassifierDispatchResult = { topicIds: readonly string[] }

// The only overridable seam is the provider boundary itself (the structured-decision client) --
// per the repository's test-mocking rule, everything else (classifier configuration lookup, the
// shared system actor, receipt claim/complete/fail, vote application, decision persistence) always
// runs for real against PostgreSQL/Valkey, even in tests. A test exercising crash-recovery or
// duplicate-claim behavior drives it by calling those real functions directly before invoking
// dispatch, not by injecting a fake for them.
export type AutotaggerClassifierDispatchDeps = {
  createClient?: typeof createStructuredDecisionClient
}

/**
 * The shared C6 dispatch path for both `runAutotaggerOnPost` and `runAutotaggerOnRssFeedItem`:
 * resolve the global `tagging` classifier, claim an atomic content/config receipt lease, run one
 * all-candidate Noul request (dispatch-classifier-execute.mts) only when no committed decision
 * already exists for that lease's batch, then apply votes via the shared classifier actor and
 * terminally complete the receipt. Callers own eligibility gating
 * (disabled/tier-zero/nondiscoverable/empty) and candidate-set assembly/caps entirely -- an empty
 * candidate list here is a defensive no-op, not the gate itself.
 */
export async function dispatchAutotaggerClassifier(
  input: AutotaggerClassifierDispatchInput,
  deps: AutotaggerClassifierDispatchDeps = {},
): Promise<AutotaggerClassifierDispatchResult | null> {
  if (input.candidates.length === 0) return null

  const configuration =
    await getActiveClassifierConfigurationBySlugFromPrimary(TAGGING_CLASSIFIER_SLUG)
  /* v8 ignore start -- only reachable if the 0635-00-02 seed is absent, or the `tagging` classifier
     was deliberately deactivated; every correctly migrated environment has an active row, and the
     intended "pause autotagging" kill-switch is the `enabled` dynamic-config field
     (getAutotaggerPaidLimitsFields), not classifier deactivation. */
  if (!configuration) {
    throw new Error(`Classifier configuration for slug '${TAGGING_CLASSIFIER_SLUG}' not found`)
  }
  /* v8 ignore stop */

  // Resolve the client and the shared actor before claiming a receipt: a missing API key or
  // missing seeded system user must throw here, before any attempt row is created for this
  // identity, not after a lease is already held.
  const buildClient = deps.createClient ?? createStructuredDecisionClient
  const baseClient = buildClient({
    transport: configuration.modelProvider,
    apiKey: resolveStructuredDecisionApiKey(configuration.modelProvider),
  })
  const sharedActorId = await getAutotaggerClassifierSystemUserId()

  const { bindings, digest } = await buildAutotaggerClassifierBindingsAndDigest(
    configuration,
    input,
  )

  const claim = await claimAutotaggerReceipt({
    subject: input.subject,
    digestVersion: AUTOTAGGER_RECEIPT_DIGEST_VERSION,
    digest,
    leaseSeconds: AUTOTAGGER_CLASSIFIER_LEASE_SECONDS,
  })

  const expectedBindings = bindings.map(binding => ({
    topicId: binding.candidate.topicId,
    storedCandidateId: binding.candidate.storedCandidateId,
  }))

  if (claim.kind === 'completed') {
    const { appliedTopicIds } = await applyTopicClassifierDecisionVotes({
      batchId: claim.batchId,
      sharedActorId,
      expectedBindings,
    })
    return { topicIds: appliedTopicIds }
  }
  if (claim.kind === 'in_progress') {
    throw new Error(
      `Autotagger classifier receipt already in progress; retry after ${claim.retryAfterSeconds}s`,
    )
  }

  const existingDecision = await readCompleteClassifierDecisionIfExistsFromPrimary(
    claim.batchId,
    'topic',
  )

  if (!existingDecision) {
    await executeAndPersistAutotaggerDecision(claim, configuration, input, bindings, baseClient)
  }

  const { appliedTopicIds } = await applyTopicClassifierDecisionVotes({
    batchId: claim.batchId,
    sharedActorId,
    expectedBindings,
  })
  await completeAutotaggerReceipt(claim.receiptId, claim.leaseToken)
  return { topicIds: appliedTopicIds }
}
