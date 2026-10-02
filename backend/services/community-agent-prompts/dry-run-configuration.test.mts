import { describe, expect, it } from 'vitest'
import { getActiveCommunityModerationClassifier } from './active-community-moderation-classifier.mts'
import { getCommunityPromptDryRunConfiguration } from './dry-run-configuration.mts'

describe('getCommunityPromptDryRunConfiguration (real PG)', () => {
  it('is exactly what a real run would pin: the active classifier prompt, model and thresholds', async () => {
    const classifier = await getActiveCommunityModerationClassifier()

    await expect(getCommunityPromptDryRunConfiguration()).resolves.toEqual({
      questionTemplate: classifier.prompt,
      modelName: classifier.modelName,
      modelProvider: classifier.modelProvider,
      thresholds: classifier.defaultThresholds,
    })
  })
})
