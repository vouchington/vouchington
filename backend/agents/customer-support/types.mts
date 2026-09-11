import type { runToolLoop } from '@agents/_shared'
import type {
  getSupportMessagesByThreadId,
  getSupportThreadById,
  createSupportDraftMessage,
  finalizeKeyedSupportAgentRun,
  createSupportAgentRun,
  claimKeyedSupportAgentRun,
  updateSupportAgentRunOutput,
  updateSupportAgentRunError,
  updateClaimedSupportAgentRunError,
  getCustomerSupportAgentUser,
  getSupportAgentRunByIdempotencyKey,
} from '@services/customer-support'
import type { SUPPORT_AGENT_SYSTEM_PROMPT } from './build-system-prompt.mts'

type GenerateSupportResponseServices = {
  getSupportThreadById?: typeof getSupportThreadById
  getSupportMessagesByThreadId?: typeof getSupportMessagesByThreadId
  createSupportDraftMessage?: typeof createSupportDraftMessage
  finalizeKeyedSupportAgentRun?: typeof finalizeKeyedSupportAgentRun
  createSupportAgentRun?: typeof createSupportAgentRun
  claimKeyedSupportAgentRun?: typeof claimKeyedSupportAgentRun
  updateSupportAgentRunOutput?: typeof updateSupportAgentRunOutput
  updateSupportAgentRunError?: typeof updateSupportAgentRunError
  updateClaimedSupportAgentRunError?: typeof updateClaimedSupportAgentRunError
  getCustomerSupportAgentUser?: typeof getCustomerSupportAgentUser
  getSupportAgentRunByIdempotencyKey?: typeof getSupportAgentRunByIdempotencyKey
  runToolLoop?: typeof runToolLoop
  buildSupportAgentSystemPrompt?: typeof SUPPORT_AGENT_SYSTEM_PROMPT
}

export type GenerateSupportResponseDeps = GenerateSupportResponseServices &
  (
    | {
        idempotencyKey?: never
        supportMessageId?: never
      }
    | {
        idempotencyKey: string
        supportMessageId: string
        reclaimLiveLease?: boolean
      }
  )
