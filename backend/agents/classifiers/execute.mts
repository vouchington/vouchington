import {
  getActiveClassifierConfigurationFromPrimary,
  persistClassifierDecision,
  type PersistClassifierDecisionCall,
  type PersistClassifierDecisionResult,
} from '@services/classifiers'
import {
  assertBindingsMatchConfiguration,
  assertClassifierDecisionIds,
  toClassifierQuestions,
} from './bindings.mts'
import { assertClassifierContextPolicy } from './context-policy.mts'
import { packClassifierDecisionQuestions } from './pack.mts'
import { assertCompleteCandidateCoverage, resultsForShard } from './results.mts'
import type {
  ExecuteClassifierDecisionDependencies,
  ExecuteClassifierDecisionInput,
} from './types.mts'

export async function executeClassifierDecision(
  input: ExecuteClassifierDecisionInput,
  dependencies: ExecuteClassifierDecisionDependencies = {},
): Promise<PersistClassifierDecisionResult> {
  assertClassifierDecisionIds(input)
  const getConfiguration =
    dependencies.getActiveClassifierConfiguration ?? getActiveClassifierConfigurationFromPrimary
  const persist = dependencies.persistClassifierDecision ?? persistClassifierDecision
  const configuration = await getConfiguration(input.classifierId)
  if (!configuration) throw new Error('Classifier does not have an active configuration')

  assertClassifierContextPolicy(input.contextPolicy)
  assertBindingsMatchConfiguration(input, configuration)
  const shards = packClassifierDecisionQuestions(
    input.state,
    toClassifierQuestions(input.bindings),
    input.contextPolicy,
  )
  const calls: PersistClassifierDecisionCall[] = []
  for (const [shardOrdinal, request] of shards.entries()) {
    const response = await input.client.decide(request, input.signal)
    calls.push({
      shardOrdinal,
      results: resultsForShard(request, response, input.bindings),
    })
  }
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
