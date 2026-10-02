import type { ClassifierRunExecution, ClassifierRunProviderHooks } from '@agents/classifier-runs'
import type { StructuredDecisionClient } from '@modules/structured-decisions'
import type {
  AutotaggerAgentRunAdapter,
  AutotaggerAgentRunConfiguration,
} from '@services/autotagger'
import type { ClassifierRunLease } from '@services/classifier-runs'
import { buildAutotaggerAgentRunInput } from './agent-run-input.mts'
import { executeTopicRun } from './topic-run.mts'

/**
 * Runs one leased C7 (scoped reasoning autotagger) run: the question set is the run's captured
 * paid-followed topics, asked over the subject's content and the topics it already has. The shared
 * classifier-run lifecycle owns attempts, terminal failures and outcomes, so a retry or replay of a
 * persisted run never reaches the provider again.
 */
export function executeAutotaggerAgentRun(
  input: {
    adapter: AutotaggerAgentRunAdapter
    lease: ClassifierRunLease<AutotaggerAgentRunConfiguration>
    maxAttempts: number
    signal: AbortSignal
  },
  dependencies: {
    createClient: (
      hooks: ClassifierRunProviderHooks,
      lease: ClassifierRunLease<AutotaggerAgentRunConfiguration>,
    ) => StructuredDecisionClient
  },
): Promise<ClassifierRunExecution> {
  return executeTopicRun(input, {
    buildInput: buildAutotaggerAgentRunInput,
    createClient: dependencies.createClient,
  })
}
