import { beginTransaction } from '@data-stores/psql'
import { projectVerifiedProviderMembershipObservation } from '@services/memberships/provider-observation-projection'
import sql from 'sql-template-strings'
import {
  acceptAppleVerificationObservation,
  createAppleVerificationLineage,
  finalizeAppleVerification,
} from './process-verification-finalize.mts'
import type { AppleVerificationContext } from './process-verification-context.mts'
import type { AppleMembershipObservation } from './types.mts'

type AppleProductMapping = {
  membershipProductId: string
  membershipProviderProductId: string
  providerProductId: string
}

export async function persistAndFinalizeAppleVerification(
  context: AppleVerificationContext,
  processingClaimToken: string,
  mapping: AppleProductMapping,
  observation: AppleMembershipObservation,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  await persistAndProjectAppleVerification(context, mapping, observation, query)
  await finalizeAppleVerificationAndCommit(context, processingClaimToken, query)
}

async function persistAndProjectAppleVerification(
  context: AppleVerificationContext,
  mapping: AppleProductMapping,
  observation: AppleMembershipObservation,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  const lineageId = await createAppleVerificationLineage(context, observation, query)
  await acceptAndProjectAppleVerification(context, lineageId, mapping, observation, query)
}

async function acceptAndProjectAppleVerification(
  context: AppleVerificationContext,
  lineageId: string,
  mapping: AppleProductMapping,
  observation: AppleMembershipObservation,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  const observationId = await acceptAppleVerificationObservation(
    context,
    lineageId,
    mapping,
    observation,
    query,
  )
  await projectVerifiedProviderMembershipObservation(
    {
      userId: context.userId,
      membershipProviderObservationId: observationId,
      sourceIdentity: {
        provider: 'apple_app_store',
        environment: context.environment,
        applicationId: context.applicationId,
        providerLineageId: observation.providerLineageId,
        ...(observation.sourceKind === 'direct'
          ? { providerAccountId: observation.appAccountToken }
          : {}),
      },
    },
    { query },
  )
}

async function finalizeAppleVerificationAndCommit(
  context: AppleVerificationContext,
  processingClaimToken: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  await finalizeAppleVerification(context, processingClaimToken, 'verified', 'verified', query)
  await query.commit()
}

export async function rejectAndCommitAppleVerification(
  context: AppleVerificationContext,
  processingClaimToken: string,
  reasonCode: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  await rejectAppleEvidenceAndFinalize(context, processingClaimToken, reasonCode, query)
  await query.commit()
}

async function rejectAppleEvidenceAndFinalize(
  context: AppleVerificationContext,
  processingClaimToken: string,
  reasonCode: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
): Promise<void> {
  await query(sql`/* rejectAppleVerificationEvidence */
    UPDATE membership_provider_evidence_records SET rejected_at = CURRENT_TIMESTAMP,
      rejection_reason = ${reasonCode}
    WHERE id = ${context.evidenceId} AND verified_at IS NULL AND rejected_at IS NULL`)
  await finalizeAppleVerification(context, processingClaimToken, 'rejected', reasonCode, query)
}
