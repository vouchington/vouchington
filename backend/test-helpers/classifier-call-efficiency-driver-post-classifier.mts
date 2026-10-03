import { POST_CLASSIFIER_SLUG } from '@voucha/types/entities/post-classifier'
import { CLASSIFIER_RUN_ATTEMPTS } from '../queues/ai-agents/config.mts'
import { createPostClassifierRegistration } from '../workers/ai-agents/processors/classifier-run-post-classifier.mts'
import { executeLeasedRun, type EfficiencyDriver } from './classifier-call-efficiency-run.mts'
import {
  createApprovedClassifierPost,
  initializePostClassifierExecutionTests,
} from './data-stores/psql/post-classifier/execution.mts'
import { categoryRelationsForTest } from './data-stores/psql/post-classifier/outcomes.mts'

/** Every remote toggle: marketplace asks five questions and each of the other five asks one. */
const EVERY_REMOTE_TOGGLE = [
  'self-promotion',
  'marketplace',
  'politics-averse',
  'click-bait',
  'vague-post',
  'shit-post',
]

/**
 * C5: the local AI-generated detector runs for free, and every toggled remote question is asked in
 * the one provider call.
 */
export const postClassifierEfficiencyDriver: EfficiencyDriver = {
  slug: POST_CLASSIFIER_SLUG,
  scope: 'C5 post classifier',
  fanOuts: [1, 10],
  questions: questionCount => questionCount,
  initialize: initializePostClassifierExecutionTests,
  async seed(questionCount) {
    const toggles = questionCount === 1 ? ['self-promotion'] : EVERY_REMOTE_TOGGLE
    const { post, inputSha256 } = await createApprovedClassifierPost(toggles, true)
    return {
      subject: { postId: post.id, rssFeedItemId: null },
      inputSha256,
      candidates: questionCount,
      effects: () => categoryRelationsForTest(post.id),
    }
  },
  executeWithoutCompleting: run =>
    executeLeasedRun(createPostClassifierRegistration(), run, CLASSIFIER_RUN_ATTEMPTS),
}
