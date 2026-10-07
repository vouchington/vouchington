import { getClassifierHumanVoteComparison } from '@services/classifiers'
import { runAndCapture } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import {
  CLASSIFIER_COMPARISON_WINDOW_FROM,
  CLASSIFIER_COMPARISON_WINDOW_TO,
  classifierComparisonClassifiers,
  classifierComparisonCommunityId,
  classifierComparisonPosts,
  loadClassifierComparisonRssFeedItemId,
} from '../seed-data/classifier-human-vote-comparison.mts'

const comparisonWindow = {
  from: CLASSIFIER_COMPARISON_WINDOW_FROM,
  to: CLASSIFIER_COMPARISON_WINDOW_TO,
}
const planSettings = { localSettings: { random_page_cost: '0.1' } }

export async function runClassifierHumanVoteComparisonScenarios(): Promise<void> {
  const rssFeedItemId = await loadClassifierComparisonRssFeedItemId()
  registerScenarioContract('classifier-human-vote-comparison-classifier', {
    expectations: [
      { kind: 'custom', name: 'classifierBatch' },
      { kind: 'maxProcessedRows', relation: 'classifier_decision_batches', max: 1_001 },
    ],
  })
  await runAndCapture(
    'classifier-human-vote-comparison-classifier',
    () =>
      getClassifierHumanVoteComparison({
        classifierId: classifierComparisonClassifiers.target,
        ...comparisonWindow,
      }),
    undefined,
    'classifierHumanVoteComparison',
    planSettings,
  )
  registerScenarioContract('classifier-human-vote-comparison-community', {
    expectations: [
      { kind: 'custom', name: 'classifierBatch' },
      { kind: 'maxProcessedRows', relation: 'classifier_decision_batches', max: 1_001 },
    ],
  })
  await runAndCapture(
    'classifier-human-vote-comparison-community',
    () =>
      getClassifierHumanVoteComparison({
        classifierId: classifierComparisonClassifiers.community,
        ...comparisonWindow,
        communityId: classifierComparisonCommunityId,
      }),
    undefined,
    'classifierHumanVoteComparison',
    planSettings,
  )
  registerScenarioContract('classifier-human-vote-comparison-post', {
    expectations: [
      { kind: 'custom', name: 'classifierBatch' },
      { kind: 'maxProcessedRows', relation: 'classifier_decision_batches', max: 1_001 },
    ],
  })
  await runAndCapture(
    'classifier-human-vote-comparison-post',
    () =>
      getClassifierHumanVoteComparison({
        classifierId: classifierComparisonClassifiers.target,
        ...comparisonWindow,
        postId: classifierComparisonPosts.target,
      }),
    undefined,
    'classifierHumanVoteComparison',
    planSettings,
  )
  registerScenarioContract('classifier-human-vote-comparison-rss-feed-item', {
    expectations: [
      { kind: 'custom', name: 'classifierBatch' },
      { kind: 'maxProcessedRows', relation: 'classifier_decision_batches', max: 1_001 },
    ],
  })
  await runAndCapture(
    'classifier-human-vote-comparison-rss-feed-item',
    () =>
      getClassifierHumanVoteComparison({
        classifierId: classifierComparisonClassifiers.rss,
        ...comparisonWindow,
        rssFeedItemId,
      }),
    undefined,
    'classifierHumanVoteComparison',
    planSettings,
  )
}
