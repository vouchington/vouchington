import { buildClassifierCommunityOverrideFixtureOperations } from './classifier-community-override-fixture-operations.mts'
import { createClassifierFixtureData } from './classifier-fixture-data.mts'
import { buildClassifierFixtureInspection } from './classifier-fixture-inspection.mts'
import { buildClassifierFixtureOperations } from './classifier-fixture-operations.mts'
import { buildClassifierResultFixtureOperations } from './classifier-result-fixture-operations.mts'
import { buildClassifierThresholdFixtureOperations } from './classifier-threshold-fixture-operations.mts'
import {
  holdClassifierThresholdReplacement,
  holdClassifierTopicBatchCapture,
} from './classifier-threshold-concurrency-fixture-operations.mts'

export async function createClassifierFixture() {
  const data = await createClassifierFixtureData()
  return {
    ...data,
    ...buildClassifierCommunityOverrideFixtureOperations(data),
    ...buildClassifierFixtureOperations(data),
    ...buildClassifierResultFixtureOperations(data),
    ...buildClassifierThresholdFixtureOperations(data),
    holdThresholdReplacement: () => holdClassifierThresholdReplacement(data),
    holdTopicBatchCapture: () => holdClassifierTopicBatchCapture(data),
    ...buildClassifierFixtureInspection(data),
  }
}
