import { getClassifierHumanVoteComparison } from '@services/classifiers'
import { runAndCapture } from '../run-support.mts'
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
