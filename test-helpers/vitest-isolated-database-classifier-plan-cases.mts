/** Physical plan statistics belong to the fixture being measured. */
export const classifierPlanIsolatedCases = {
  'classifier-comparison-force_custom_plan-classifier': {
    file: 'backend/services/classifiers/human-vote-comparison-query-plan.test.mts',
    fullName:
      'classifier human vote comparison query plan > in force_custom_plan mode > bounds the batch scan by the id window with the classifier filter',
  },
  'classifier-comparison-force_custom_plan-community': {
    file: 'backend/services/classifiers/human-vote-comparison-query-plan.test.mts',
    fullName:
      'classifier human vote comparison query plan > in force_custom_plan mode > bounds the batch scan by the id window with the community filter',
  },
  'classifier-comparison-force_custom_plan-post': {
    file: 'backend/services/classifiers/human-vote-comparison-query-plan.test.mts',
    fullName:
      'classifier human vote comparison query plan > in force_custom_plan mode > bounds the batch scan by the id window with the post filter',
  },
  'classifier-comparison-force_custom_plan-rssFeedItem': {
    file: 'backend/services/classifiers/human-vote-comparison-query-plan.test.mts',
    fullName:
      'classifier human vote comparison query plan > in force_custom_plan mode > bounds the batch scan by the id window with the rssFeedItem filter',
  },
  'classifier-comparison-force_generic_plan-classifier': {
    file: 'backend/services/classifiers/human-vote-comparison-query-plan.test.mts',
    fullName:
      'classifier human vote comparison query plan > in force_generic_plan mode > bounds the batch scan by the id window with the classifier filter',
  },
  'classifier-comparison-force_generic_plan-community': {
    file: 'backend/services/classifiers/human-vote-comparison-query-plan.test.mts',
    fullName:
      'classifier human vote comparison query plan > in force_generic_plan mode > bounds the batch scan by the id window with the community filter',
  },
  'classifier-comparison-force_generic_plan-post': {
    file: 'backend/services/classifiers/human-vote-comparison-query-plan.test.mts',
    fullName:
      'classifier human vote comparison query plan > in force_generic_plan mode > bounds the batch scan by the id window with the post filter',
  },
  'classifier-comparison-force_generic_plan-rssFeedItem': {
    file: 'backend/services/classifiers/human-vote-comparison-query-plan.test.mts',
    fullName:
      'classifier human vote comparison query plan > in force_generic_plan mode > bounds the batch scan by the id window with the rssFeedItem filter',
  },
} as const
