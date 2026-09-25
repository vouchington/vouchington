import {
  getActiveClassifierConfigurationFromPrimary,
  persistClassifierDecision,
  type PersistClassifierDecisionCall,
  type PersistClassifierDecisionResult,
} from '@services/classifiers'
import { toClassifierQuestions } from './bindings.mts'
import {
  assertBindingsMatchConfiguration,
  assertClassifierDecisionIds,
} from './validate-bindings.mts'
import { assertCompleteCandidateCoverage, resultsForShard } from './results.mts'
import type {
  ExecuteClassifierDecisionDependencies,
  ExecuteSingleCallClassifierDecisionInput,
} from './types.mts'

/**
 * A sharding-free twin of `executeClassifierDecision` for classifier
 * families with no exact context measurer (see
 * docs/overview/architecture/structured-decisions.md). It sends every
 * binding as one request instead of packing shards against a token budget,
 * and lets an oversized-context provider rejection surface as an ordinary
 * `StructuredDecisionError` for the caller's own retry/queue semantics to
 * handle — it makes no token estimate and never approximates one.
 */
export async function executeSingleCallClassifierDecision(
  input: ExecuteSingleCallClassifierDecisionInput,
  dependencies: ExecuteClassifierDecisionDependencies = {},
): Promise<PersistClassifierDecisionResult> {
  assertClassifierDecisionIds(input)
  const getConfiguration =
    dependencies.getActiveClassifierConfiguration ?? getActiveClassifierConfigurationFromPrimary
  const persist = dependencies.persistClassifierDecision ?? persistClassifierDecision
  const configuration = await getConfiguration(input.classifierId)
  if (!configuration) throw new Error('Classifier does not have an active configuration')

  assertBindingsMatchConfiguration(input, configuration)
  const request = { state: input.state, questions: toClassifierQuestions(input.bindings) }
  const response = await input.client.decide(request, input.signal)
  const calls: PersistClassifierDecisionCall[] = [
    { shardOrdinal: 0, results: resultsForShard(request, response, input.bindings) },
  ]
  assertCompleteCandidateCoverage(input.bindings, calls)
  return persist({
    batchId: input.batchId,
    classifierId: configuration.classifierId,
    promptVersionId: input.promptVersionId,
    subject: input.subject,
    scope: input.scope,
    calls,
  })
}
