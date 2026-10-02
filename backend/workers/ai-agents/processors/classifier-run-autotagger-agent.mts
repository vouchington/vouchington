import { createAutotaggerAgentClient, executeAutotaggerAgentRun } from '@agents/autotagger'
import {
  createAutotaggerAgentRunAdapter,
  type AutotaggerAgentEffects,
  type AutotaggerAgentRunConfiguration,
} from '@services/autotagger'
import type { ClassifierRunRegistration } from './classifier-run-handler.mts'

/**
 * C7: the only worker code the scoped reasoning autotagger owns. The shared classifier-run
 * lifecycle claims, caps, fails and completes the run; this hands the leased run to C7's input
 * building. C7 is a leaf: nothing follows it, so it has no `afterCompleted`.
 */
export function createAutotaggerAgentRegistration(): ClassifierRunRegistration<
  AutotaggerAgentRunConfiguration,
  never,
  AutotaggerAgentEffects
> {
  const adapter = createAutotaggerAgentRunAdapter()
  return {
    adapter,
    execute: (lease, { maxAttempts, signal }) =>
      executeAutotaggerAgentRun(
        { adapter, lease, maxAttempts, signal },
        {
          createClient: (hooks, current) =>
            createAutotaggerAgentClient({
              postId: current.subject.postId,
              modelProvider: current.resolved.configuration.modelProvider,
              classifierRunId: hooks.classifierRunId,
              beforeAttempt: hooks.beforeAttempt,
            }),
        },
      ),
  }
}
