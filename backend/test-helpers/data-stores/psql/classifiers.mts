import {
  buildClassifierCommunityPromptFixtureOperations,
  createClassifierCommunityPromptFixtureData,
} from './classifier-community-prompt-fixture-operations.mts'
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

/** A classifier fixture plus a community-prompt classifier and one community moderation prompt. */
export async function createClassifierCommunityPromptFixture() {
  const fixture = await createClassifierFixture()
  const prompts = await createClassifierCommunityPromptFixtureData(fixture)
  return {
    ...fixture,
    ...prompts,
    ...buildClassifierCommunityPromptFixtureOperations(fixture, prompts),
  }
}
