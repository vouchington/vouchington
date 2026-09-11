import { assertOpenAiSpendCapNotBreached, OpenAiSpendCapBreachError } from '@services/ai-usage'
import type { RunToolLoopDeps } from './types.mts'

/**
 * Rechecks the daily OpenAI spend cap before an in-loop model call. The pre-dispatch check in
 * processAIAgentWorkerJob (backend/workers/ai-agents/workers/core.mts) only runs once before the
 * whole job, but a tool loop can issue many OpenAI calls on its own -- this closes that gap.
 * Skipped when agentSlug is unset, matching callRecordingToolLoopUsage's existing convention for
 * ledger recording (test fixtures that omit it don't want a DB-backed check); every real call
 * site sets it. Throws OpenAiSpendCapBreachError on a breach, caught by processAIAgentWorkerJob
 * and converted into the same job.moveToDelayed() defer as the pre-dispatch check.
 */
export async function assertSpendCapNotBreachedForIteration(
  agentSlug: string | undefined,
  deps: Pick<RunToolLoopDeps, 'assertOpenAiSpendCapNotBreached'>,
): Promise<void> {
  if (!agentSlug) return
  const check = deps.assertOpenAiSpendCapNotBreached ?? assertOpenAiSpendCapNotBreached
  const breach = await check(agentSlug)
  if (breach) throw new OpenAiSpendCapBreachError(breach)
}
