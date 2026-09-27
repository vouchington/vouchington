import {
  getActiveClassifierConfigurationFromPrimary,
  type PersistClassifierDecisionCall,
  type PersistClassifierDecisionInput,
} from '@services/classifiers'
import { toClassifierQuestions } from './bindings.mts'
import {
  assertBindingsMatchConfiguration,
  assertClassifierDecisionIds,
} from './validate-bindings.mts'
import { assertCompleteCandidateCoverage, resultsForShard } from './results.mts'
import type { ExecuteSingleCallClassifierDecisionInput } from './types.mts'

export type PrepareSingleCallClassifierDecisionDependencies = {
  getActiveClassifierConfiguration?: typeof getActiveClassifierConfigurationFromPrimary
}

export async function prepareSingleCallClassifierDecision(
  input: ExecuteSingleCallClassifierDecisionInput,
  dependencies: PrepareSingleCallClassifierDecisionDependencies = {},
): Promise<PersistClassifierDecisionInput> {
  assertClassifierDecisionIds(input)
  const getConfiguration =
    dependencies.getActiveClassifierConfiguration ?? getActiveClassifierConfigurationFromPrimary
  const configuration = await getConfiguration(input.classifierId)
  if (!configuration) throw new Error('Classifier does not have an active configuration')
  assertBindingsMatchConfiguration(input, configuration)
  const request = { state: input.state, questions: toClassifierQuestions(input.bindings) }
  const response = await input.client.decide(request, input.signal)
  const calls: PersistClassifierDecisionCall[] = [
    { shardOrdinal: 0, results: resultsForShard(request, response, input.bindings) },
  ]
  assertCompleteCandidateCoverage(input.bindings, calls)
  return {
    batchId: input.batchId,
    classifierId: configuration.classifierId,
    promptVersionId: input.promptVersionId,
    subject: input.subject,
    scope: input.scope,
    calls,
  }
}
