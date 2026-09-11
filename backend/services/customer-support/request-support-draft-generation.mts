import { enqueueCustomerSupportAwaited } from '@queues/ai-agents/enqueues/customer-support'
import type { AgentModel, AgentModelProvider } from '@voucha/types/entities/agent-model'
import {
  reserveSupportDraftGeneration,
  type SupportDraftGenerationReservationResult,
} from './draft-generation-reservation.mts'

export type RequestSupportDraftGenerationDependencies = {
  enqueueCustomerSupport: typeof enqueueCustomerSupportAwaited
}

const dependencies: RequestSupportDraftGenerationDependencies = {
  enqueueCustomerSupport: enqueueCustomerSupportAwaited,
}

export async function requestSupportDraftGeneration(
  threadId: string,
  params: { modelName: AgentModel; modelProvider: AgentModelProvider },
  overrides: Partial<RequestSupportDraftGenerationDependencies> = {},
): Promise<SupportDraftGenerationReservationResult> {
  const reservation = await reserveSupportDraftGeneration(threadId, params)
  if (reservation.status !== 'reserved') return reservation
  await (overrides.enqueueCustomerSupport ?? dependencies.enqueueCustomerSupport)(threadId, {
    logicalJobId: reservation.idempotencyKey,
    supportMessageId: reservation.supportMessageId,
  })
  return reservation
}
