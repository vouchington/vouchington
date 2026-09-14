import type { MicrosoftStoreVerificationResult } from './types.mts'
import {
  validateMicrosoftStoreAuthoritativeEvidence,
  type MicrosoftStoreAuthoritativeStateOptions,
} from './authoritative-state-validation.mts'
import {
  normalizeMicrosoftStoreLifecycle,
  observationRevision,
} from './authoritative-state-lifecycle.mts'
import { createMicrosoftStoreLineageIdentity } from './lineage-identity.mts'

/** Converts only mutually corroborating Collections and Recurrence facts into an entitlement. */
export function verifyMicrosoftStoreAuthoritativeState(
  options: MicrosoftStoreAuthoritativeStateOptions,
): MicrosoftStoreVerificationResult {
  const validation = validateMicrosoftStoreAuthoritativeEvidence(options)
  if (!validation.accepted) return validation
  const lifecycle = normalizeMicrosoftStoreLifecycle(validation.evidence)
  if (!lifecycle) return reject('invalid_evidence')
  return acceptObservation(options, validation.evidence, lifecycle)
}

function acceptObservation(
  options: MicrosoftStoreAuthoritativeStateOptions,
  evidence: Parameters<typeof normalizeMicrosoftStoreLifecycle>[0],
  lifecycle: NonNullable<ReturnType<typeof normalizeMicrosoftStoreLifecycle>>,
): MicrosoftStoreVerificationResult {
  const { collection } = evidence
  return {
    accepted: true,
    observation: {
      provider: 'microsoft_store',
      environment: options.environment,
      applicationId: options.applicationId,
      membershipProductId: options.membershipProductId,
      providerProductId: options.productId,
      providerLineageId: createMicrosoftStoreLineageIdentity({
        applicationId: options.applicationId,
        productId: options.productId,
        skuId: collection.skuId ?? null,
        recurrenceId: collection.recurrenceData,
      }),
      providerAccountId: null,
      collectionItemId: collection.id,
      ...observationRevision({ evidence, lifecycle }),
      effectiveAt: evidence.effectiveAt,
      expiresAt: lifecycle.expiresAt,
      terminalAt: lifecycle.terminalAt,
      lifecycle: lifecycle.lifecycle,
      autoRenews: lifecycle.autoRenews,
    },
  }
}
function reject(
  reasonCode: 'wrong_account' | 'wrong_product' | 'invalid_evidence',
): MicrosoftStoreVerificationResult {
  return { accepted: false, reasonCode }
}
