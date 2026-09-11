import onError from '@modules/on-error'
import { OpenAiSpendCapBreachError } from '@services/ai-usage'
import {
  releaseClaimedSupportAgentRun,
  updateSupportAgentRunError as defaultUpdateSupportAgentRunError,
  updateClaimedSupportAgentRunError as defaultUpdateClaimedSupportAgentRunError,
} from '@services/customer-support'
import type { GenerateSupportResponseDeps } from './types.mts'

// A mid-loop OpenAI spend-cap breach must reach processAIAgentWorkerJob's job.moveToDelayed()
// defer, not the terminal failed_at path -- a failed_at run stops blocking
// reserveSupportDraftGeneration's active-run predicate, letting a second reservation admit while
// the deferred job is still pending (see draft-generation-reservation.mts).
export async function handleSupportAgentRunError(
  error: unknown,
  agentRunId: string,
  claimToken: string | null,
  deps: GenerateSupportResponseDeps,
): Promise<void> {
  if (error instanceof OpenAiSpendCapBreachError) {
    if (claimToken) {
      await releaseClaimedSupportAgentRun(agentRunId, claimToken)
    }
    throw error
  }

  const err = error instanceof Error ? error : new Error(String(error))
  onError(err)

  if (!claimToken) {
    const updateAgentRunError = deps.updateSupportAgentRunError ?? defaultUpdateSupportAgentRunError
    await updateAgentRunError(agentRunId, { error: err.message })
    return
  }

  const updateClaimedAgentRunError =
    deps.updateClaimedSupportAgentRunError ?? defaultUpdateClaimedSupportAgentRunError
  try {
    const ownsClaim = await updateClaimedAgentRunError(agentRunId, claimToken, {
      error: err.message,
    })
    if (!ownsClaim) return
  } catch (persistenceError) {
    onError(
      persistenceError instanceof Error ? persistenceError : new Error(String(persistenceError)),
    )
  }
  throw error
}
