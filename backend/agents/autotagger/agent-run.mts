import { callAgentToolTurn, type AgentToolTurnCaller } from '@agents/_shared'
import type { ClassifierRunExecution } from '@agents/classifier-runs'
import type { ClassifierSafeText } from '@agents/classifiers/safe-content'
import { ModelProviderError } from '@modules/model-providers/errors'
import type { ModelSelection } from '@modules/model-providers/types'
import {
  readAutotaggerAppliedTopicNames,
  readAutotaggerCandidateTopics,
  getAutotaggerPaidLimitsFields,
  type AutotaggerAgentFacts,
  type AutotaggerAgentRunAdapter,
  type AutotaggerAgentRunConfiguration,
} from '@services/autotagger'
import { SpendCapBreachError } from '@services/ai-usage'
import {
  failClassifierRunAttempt,
  persistClassifierRunOutcomes,
  readClassifierRunOutcomes,
  releaseClassifierRunLease,
  startClassifierProviderAttempt,
  type ClassifierRunFailureKind,
  type ClassifierRunLease,
} from '@services/classifier-runs'
import { AUTOTAGGER_AGENT_SLUG } from '@voucha/types/entities/autotagger-agent'
import { buildAutotaggerAgentInput } from './agent-instructions.mts'
import {
  runAutotaggerAgentLoop,
  type AutotaggerAgentBounds,
  type AutotaggerAgentLoopResult,
} from './agent-loop.mts'
import { buildAutotaggerAgentTools, searchTopicsByText, type SearchTopics } from './agent-tools.mts'
import { loadSubjectState } from './subject-state.mts'

export type AutotaggerAgentDependencies = {
  /** The `autotagger-agent` entry of the `ai-model-routing` setting, read by the worker. */
  selection: ModelSelection
  /** Replaces the real provider turn and topic search in tests. */
  callTurn?: AgentToolTurnCaller
  search?: SearchTopics
  bounds?: AutotaggerAgentBounds
}

class AttemptStopped extends Error {
  readonly outcome: 'stale' | 'replay' | 'terminal'
  constructor(outcome: 'stale' | 'replay' | 'terminal') {
    super(`autotagger agent provider attempt did not start: ${outcome}`)
    this.outcome = outcome
  }
}

type Phase = { reserved: boolean; billedTurns: number }

function configuredBounds(): AutotaggerAgentBounds {
  const limits = getAutotaggerPaidLimitsFields()
  return {
    maxTurns: limits.agent_max_turns,
    maxToolCalls: limits.agent_max_tool_calls,
    maxOutputTokens: limits.agent_max_output_tokens,
  }
}

/**
 * How a failure after the provider attempt was reserved ends the attempt, or null when it is not
 * the provider's and nothing was billed (the queue retries it). D3: a run retries only while no
 * turn has billed. Once one has, any failure ends the run for good, so a retry can never bill the
 * same content's earlier turns a second time.
 */
function classifyAgentFailure(
  error: unknown,
  phase: Phase,
  signal: AbortSignal,
): { kind: ClassifierRunFailureKind; permanent: boolean } | null {
  const billed =
    phase.billedTurns > 0 || (error instanceof ModelProviderError && !!error.billedResponse)
  if (error instanceof ModelProviderError) {
    const unusable =
      error.code === 'invalid-response' ||
      error.code === 'refusal' ||
      error.code === 'output-truncated'
    return {
      kind: unusable ? 'invalid-result' : 'provider-error',
      permanent: error.retryClass === 'permanent' || billed,
    }
  }
  if (signal.aborted) return { kind: 'provider-error', permanent: billed }
  return billed ? { kind: 'invalid-result', permanent: true } : null
}

async function runAgent(
  input: {
    adapter: AutotaggerAgentRunAdapter
    lease: ClassifierRunLease<AutotaggerAgentRunConfiguration>
    maxAttempts: number
    signal: AbortSignal
  },
  dependencies: AutotaggerAgentDependencies,
  state: ClassifierSafeText,
  phase: Phase,
): Promise<AutotaggerAgentLoopResult> {
  const { adapter, lease, maxAttempts, signal } = input
  const [candidates, appliedTopicNames] = await Promise.all([
    readAutotaggerCandidateTopics(lease.capturedTopicIds),
    readAutotaggerAppliedTopicNames(lease.subject),
  ])
  const tools = buildAutotaggerAgentTools(lease.capturedTopicIds)
  return runAutotaggerAgentLoop({
    input: await buildAutotaggerAgentInput({
      state,
      appliedTopicNames,
      candidates,
    }),
    tools,
    candidateIds: lease.capturedTopicIds,
    bounds: dependencies.bounds ?? configuredBounds(),
    search: dependencies.search ?? searchTopicsByText,
    safetyIdentifier: lease.resolved.actorId,
    signal,
    callTurn: async (request, turn) => {
      const result = await callAgentToolTurn({
        request,
        callTurn: dependencies.callTurn,
        agentSlug: AUTOTAGGER_AGENT_SLUG,
        selection: dependencies.selection,
        postId: lease.subject.postId,
        classifierRunId: lease.runId,
        signal,
        // The spend cap is checked before every turn; only the first reserves the provider attempt
        // (and so counts against the run's attempt cap), after the cap admitted it.
        beforeDispatch:
          turn === 1
            ? async () => {
                const attempt = await startClassifierProviderAttempt(adapter, {
                  lease,
                  maxAttempts,
                })
                if (attempt === 'no_remote') throw new Error('Agent run has no provider attempt')
                if (attempt !== 'started') throw new AttemptStopped(attempt)
                phase.reserved = true
              }
            : undefined,
      })
      phase.billedTurns++
      return result
    },
  })
}

/**
 * Runs one leased C7 run: a bounded tool-using agent decides which captured candidate topics are
 * true of the subject's content. The shared lifecycle owns the receipt, lease and attempt cap; the
 * agent's answer is the run's local outcome (facts, never probabilities), persisted before any
 * effect. A run whose outcomes are already durable returns before any model call. Every turn is
 * checked against the daily spend cap before dispatch and billed to the run in the ledger. The
 * provider attempt is reserved at the first turn only (D3: no retry after a turn has billed).
 */
export async function executeAutotaggerAgentRun(
  input: {
    adapter: AutotaggerAgentRunAdapter
    lease: ClassifierRunLease<AutotaggerAgentRunConfiguration>
    maxAttempts: number
    signal: AbortSignal
  },
  dependencies: AutotaggerAgentDependencies,
): Promise<ClassifierRunExecution> {
  const { adapter, lease, maxAttempts, signal } = input
  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0)
    throw new Error('classifier run provider attempt limit must be positive')
  if (await readClassifierRunOutcomes(adapter, lease)) return 'replay'
  const buildState = await loadSubjectState(lease)
  if (!buildState) return 'stale'
  const persist = (facts: AutotaggerAgentFacts) =>
    persistClassifierRunOutcomes(adapter, { lease, local: facts })
  // Every captured topic was deleted after reservation: nothing to ask, so no model call.
  if (lease.capturedTopicIds.length === 0) return persist({ topicIds: [] })

  const phase: Phase = { reserved: false, billedTurns: 0 }
  let result: AutotaggerAgentLoopResult
  try {
    result = await runAgent(input, dependencies, await buildState(), phase)
  } catch (err) {
    if (err instanceof AttemptStopped) return err.outcome
    if (!phase.reserved) {
      if (err instanceof SpendCapBreachError) await releaseClassifierRunLease(adapter, lease)
      throw err
    }
    const classified = classifyAgentFailure(err, phase, signal)
    if (classified) {
      const failure = await failClassifierRunAttempt(adapter, {
        lease,
        maxAttempts,
        failureKind: classified.kind,
        permanent: classified.permanent,
      })
      if (failure !== 'released') return failure
    }
    throw err
  }
  return persist({ topicIds: result.topicIds })
}
