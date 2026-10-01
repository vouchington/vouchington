import { createAutotaggerClient, executeAutotaggerRun } from '@agents/autotagger'
import {
  createAutotaggerRunAdapter,
  type AutotaggerEffects,
  type AutotaggerRunConfiguration,
} from '@services/autotagger'
import type { ClassifierRunRegistration } from './classifier-run-handler.mts'

/**
 * C6: the only worker code the tagging classifier owns. The shared classifier-run lifecycle claims,
 * caps, fails and completes the run; this hands the leased run to C6's input building.
 */
export function createAutotaggerRegistration(): ClassifierRunRegistration<
  AutotaggerRunConfiguration,
  never,
  AutotaggerEffects
> {
  const adapter = createAutotaggerRunAdapter()
  return {
    adapter,
    execute: (lease, { maxAttempts, signal }) =>
      executeAutotaggerRun(
        { adapter, lease, maxAttempts, signal },
        {
          createClient: (hooks, current) =>
            createAutotaggerClient({
              postId: current.subject.postId,
              modelProvider: current.resolved.configuration.modelProvider,
              beforeAttempt: hooks.beforeAttempt,
            }),
        },
      ),
  }
}
