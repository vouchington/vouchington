import { beginTransaction } from '@data-stores/psql'
import { projectVerifiedProviderMembershipObservation } from '../provider-observation-projection.mts'
import { acceptObservation, persistCredentials } from './verification-finalization.mts'
import { finalizeVerified } from './verification-outcomes.mts'
import {
  persistLineage,
  type Context,
  type Evidence,
  type Mapping,
} from './verification-persistence.mts'
import type { MicrosoftStoreObservation } from './types.mts'

type Transaction = Awaited<ReturnType<typeof beginTransaction>>

/** Records the verified provider fact, advances the source, then retains only current keys. */
export async function commitAcceptedMicrosoftStoreVerification(options: {
  context: Context
  token: string
  mapping: Mapping
  evidence: Evidence
  observation: MicrosoftStoreObservation
  query: Transaction
}): Promise<void> {
  const recorded = await recordAndFinalize(options)
  await projectAndRetain(options, recorded)
}

async function recordAndFinalize(options: {
  context: Context
  token: string
  mapping: Mapping
  observation: MicrosoftStoreObservation
  query: Transaction
}): Promise<{ lineageId: string; observationId: string }> {
  const recorded = await recordObservation(options)
  await finalizeVerified(options.context, options.token, options.query)
  return recorded
}

async function recordObservation(options: {
  context: Context
  mapping: Mapping
  observation: MicrosoftStoreObservation
  query: Transaction
}): Promise<{ lineageId: string; observationId: string }> {
  const lineageId = await persistLineage(options.context, options.observation, options.query)
  const observationId = await acceptObservation(
    options.context,
    lineageId,
    options.mapping,
    options.observation,
    options.query,
  )
  return { lineageId, observationId }
}

async function projectAndRetain(
  options: {
    context: Context
    evidence: Evidence
    observation: MicrosoftStoreObservation
    query: Transaction
  },
  recorded: { lineageId: string; observationId: string },
): Promise<void> {
  await projectVerifiedProviderMembershipObservation(
    {
      userId: options.context.userId,
      membershipProviderObservationId: recorded.observationId,
      retainWhenDirectAdmissionRejected: true,
    },
    { query: options.query },
  )
  await persistCredentials(
    options.context,
    recorded.lineageId,
    recorded.observationId,
    options.evidence,
    options.observation,
    options.query,
  )
}
