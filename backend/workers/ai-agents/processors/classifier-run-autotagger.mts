import { createAutotaggerClient, executeAutotaggerRun } from '@agents/autotagger'
import { enqueueClassifierRunDispatcher } from '@queues/ai-agents/enqueues/classifier-run'
import {
  createAutotaggerRunAdapter,
  type AutotaggerEffects,
  type AutotaggerRunConfiguration,
} from '@services/autotagger'
import { AUTOTAGGER_AGENT_SLUG } from '@voucha/types/entities/autotagger-agent'
import type { ClassifierRunRegistration } from './classifier-run-handler.mts'

/**
 * C6: the only worker code the tagging classifier owns. The shared classifier-run lifecycle claims,
 * caps, fails and completes the run; this hands the leased run to C6's input building.
 *
 * After the run completes (or replays as completed) it dispatches the scoped reasoning autotagger
 * (C7), whose durable request the completion transaction already wrote. The dispatch is only a
 * latency optimization and is awaited, so a failed enqueue fails the job and the queue retries it;
 * even if every retry fails the request is still pending, and the recovery sweep dispatches it.
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
    afterCompleted: subject =>
      enqueueClassifierRunDispatcher({
        classifier: AUTOTAGGER_AGENT_SLUG,
        postId: subject.postId,
        rssFeedItemId: subject.rssFeedItemId,
      }),
  }
}
