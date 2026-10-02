import type { QueryExecutor } from '@data-stores/psql'
import type { ClassifierModelProvider, ClassifierThresholds } from '@voucha/types'
import { getActiveCommunityModerationClassifier } from './active-community-moderation-classifier.mts'

/**
 * What a moderator dry run asks and judges by: the active `community-moderation` classifier
 * version, exactly as a real run would pin it. It is not community specific; the rule under test
 * is supplied by the caller.
 */
export type CommunityPromptDryRunConfiguration = {
  questionTemplate: string
  modelName: string
  modelProvider: ClassifierModelProvider
  thresholds: ClassifierThresholds
}

export async function getCommunityPromptDryRunConfiguration(
  query?: QueryExecutor,
): Promise<CommunityPromptDryRunConfiguration> {
  const classifier = await getActiveCommunityModerationClassifier(query)
  return {
    questionTemplate: classifier.prompt,
    modelName: classifier.modelName,
    modelProvider: classifier.modelProvider,
    thresholds: classifier.defaultThresholds,
  }
}
