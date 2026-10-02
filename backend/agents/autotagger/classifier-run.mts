import type { ClassifierRunExecution, ClassifierRunProviderHooks } from '@agents/classifier-runs'
import type { StructuredDecisionClient } from '@modules/structured-decisions'
import type { AutotaggerRunAdapter, AutotaggerRunConfiguration } from '@services/autotagger'
import type { ClassifierRunLease } from '@services/classifier-runs'
import { buildAutotaggerRunInput } from './classifier-run-input.mts'
import { executeTopicRun } from './topic-run.mts'

/**
 * Runs one leased C6 run: the question set is the run's captured topics, asked over the subject's
 * content. The shared classifier-run lifecycle owns attempts, terminal failures and outcomes.
 */
export function executeAutotaggerRun(
  input: {
    adapter: AutotaggerRunAdapter
    lease: ClassifierRunLease<AutotaggerRunConfiguration>
    maxAttempts: number
    signal: AbortSignal
  },
  dependencies: {
    createClient: (
      hooks: ClassifierRunProviderHooks,
      lease: ClassifierRunLease<AutotaggerRunConfiguration>,
    ) => StructuredDecisionClient
  },
): Promise<ClassifierRunExecution> {
  return executeTopicRun(input, {
    buildInput: buildAutotaggerRunInput,
    createClient: dependencies.createClient,
  })
}
