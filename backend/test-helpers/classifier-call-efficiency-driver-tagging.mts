import { TAGGING_CLASSIFIER_SLUG } from '@voucha/types/entities/tagging-classifier'
import { CLASSIFIER_RUN_ATTEMPTS } from '../queues/ai-agents/config.mts'
import { createAutotaggerRegistration } from '../workers/ai-agents/processors/classifier-run-autotagger.mts'
import { executeLeasedRun, type EfficiencyDriver } from './classifier-call-efficiency-run.mts'
import {
  createAutotaggerPostFixture,
  createNearbyTopic,
} from './data-stores/psql/classifier-runs/autotagger-fixture.mts'
import { readSubjectTopicRelationFacts } from './data-stores/psql/classifier-runs/subject-topic-relations.mts'

/**
 * C6: one question per captured topic, asked in one provider call however many topics there are.
 * Ten is the default Pro topic limit (`post_pro_max_topics`), which an operator can raise: the run
 * sends every question in one request and never splits it, so a larger set is still one call (a
 * request too large for the provider fails the run instead of billing a second call).
 */
export const taggingEfficiencyDriver: EfficiencyDriver = {
  slug: TAGGING_CLASSIFIER_SLUG,
  scope: 'C6 tagging classifier',
  fanOuts: [1, 10],
  lateCandidates: true,
  questions: topicCount => topicCount,
  async seed(topicCount) {
    const fixture = await createAutotaggerPostFixture({ plan: 'pro', topicCount })
    return {
      subject: fixture.subject,
      inputSha256: fixture.inputSha256,
      candidates: topicCount,
      effects: () => readSubjectTopicRelationFacts(fixture.subject),
      // A topic nearer than the captured ones: a later search finds it, the receipt never asks.
      addCandidate: async () => void (await createNearbyTopic(fixture.embedding, 0.0001)),
    }
  },
  executeWithoutCompleting: run =>
    executeLeasedRun(createAutotaggerRegistration(), run, CLASSIFIER_RUN_ATTEMPTS),
}
