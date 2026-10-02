import {
  executeClassifierRun,
  type ClassifierRunExecution,
  type ClassifierRunProviderHooks,
  type ClassifierRunRemoteInput,
} from '@agents/classifier-runs'
import type { ClassifierSafeText } from '@agents/classifiers/safe-content'
import type { StructuredDecisionClient } from '@modules/structured-decisions'
import type { ClassifierRunAdapter, ClassifierRunLease } from '@services/classifier-runs'
import { loadSubjectState } from './subject-state.mts'

/**
 * Runs one leased topic classifier run (either autotagger stage). The shared classifier-run
 * lifecycle reserves and caps the provider attempt, records terminal failures and persists
 * outcomes; this loads the subject's content at the receipt's revision (stale when it has moved
 * on) and hands the stage's own question builder to the shared executor.
 */
export async function executeTopicRun<C, E>(
  input: {
    adapter: ClassifierRunAdapter<C, never, E>
    lease: ClassifierRunLease<C>
    maxAttempts: number
    signal: AbortSignal
  },
  dependencies: {
    buildInput: (
      lease: ClassifierRunLease<C>,
      state: ClassifierSafeText,
    ) => Promise<ClassifierRunRemoteInput | null>
    createClient: (
      hooks: ClassifierRunProviderHooks,
      lease: ClassifierRunLease<C>,
    ) => StructuredDecisionClient
  },
): Promise<ClassifierRunExecution> {
  const { adapter, lease } = input
  const buildState = await loadSubjectState(lease)
  if (!buildState) return 'stale'
  return executeClassifierRun(
    adapter,
    { lease, maxAttempts: input.maxAttempts, signal: input.signal },
    {
      buildRemoteInput: async currentLease =>
        dependencies.buildInput(currentLease, await buildState()),
      createClient: hooks => dependencies.createClient(hooks, lease),
    },
  )
}
