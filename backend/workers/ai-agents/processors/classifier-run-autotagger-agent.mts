import { executeAutotaggerAgentRun } from '@agents/autotagger'
import { loadServiceModelSelection } from '@services/ai-usage'
import {
  createAutotaggerAgentRunAdapter,
  type AutotaggerAgentEffects,
  type AutotaggerAgentFacts,
  type AutotaggerAgentRunConfiguration,
} from '@services/autotagger'
import { AUTOTAGGER_AGENT_SLUG } from '@voucha/types/entities/autotagger-agent'
import type { ClassifierRunRegistration } from './classifier-run-handler.mts'

/**
 * C7: the only worker code the scoped reasoning autotagger owns. The shared classifier-run
 * lifecycle claims, caps, fails and completes the run; this reads the agent's provider and model
 * from the `ai-model-routing` setting (so a switch applies to the next run without a deploy) and
 * hands the leased run to the agent. C7 is a leaf: nothing follows it, so it has no `afterCompleted`.
 */
export function createAutotaggerAgentRegistration(): ClassifierRunRegistration<
  AutotaggerAgentRunConfiguration,
  AutotaggerAgentFacts,
  AutotaggerAgentEffects
> {
  const adapter = createAutotaggerAgentRunAdapter()
  return {
    adapter,
    execute: async (lease, { maxAttempts, signal }) =>
      executeAutotaggerAgentRun(
        { adapter, lease, maxAttempts, signal },
        { selection: await loadServiceModelSelection(AUTOTAGGER_AGENT_SLUG) },
      ),
  }
}
