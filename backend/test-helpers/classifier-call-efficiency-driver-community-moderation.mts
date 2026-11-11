import { COMMUNITY_MODERATION_CLASSIFIER_SLUG } from '@voucha/types/entities/community-moderation-classifier'
import { CLASSIFIER_RUN_ATTEMPTS } from '../queues/ai-agents/config.mts'
import { createCommunityModerationRegistration } from '../workers/ai-agents/processors/classifier-run-community-moderation.mts'
import { executeLeasedRun, type EfficiencyDriver } from './classifier-call-efficiency-run.mts'
import {
  createCommunityModerationFixture,
  readCommunityModerationProjection,
} from './data-stores/psql/classifier-runs/community-moderation-fixture.mts'

/**
 * C8: one bounded page of a community's rules is one question set in one call. The largest
 * fan-out here is the per-call question cap, so these fixtures still complete in one call.
 */
export const communityModerationEfficiencyDriver: EfficiencyDriver = {
  slug: COMMUNITY_MODERATION_CLASSIFIER_SLUG,
  scope: 'C8 community moderation classifier',
  completedRequestOutcome: 'no-work',
  fanOuts: [1, 30],
  questions: ruleCount => ruleCount,
  async seed(ruleCount) {
    const ruleTexts = Array.from({ length: ruleCount }, (_, index) => `No rule breaking ${index}`)
    const fixture = await createCommunityModerationFixture({ ruleTexts })
    return {
      subject: fixture.subject,
      inputSha256: fixture.inputSha256,
      candidates: ruleCount,
      effects: () => readCommunityModerationProjection(fixture.postId),
    }
  },
  executeWithoutCompleting: run =>
    executeLeasedRun(createCommunityModerationRegistration(), run, CLASSIFIER_RUN_ATTEMPTS),
}
