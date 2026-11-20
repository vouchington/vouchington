import {
  classifierDecisionLimitsConfig,
  CLASSIFIER_DECISION_LIMIT_MAX_VALUES,
} from '@services/classifiers/decision-result-limits'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const classifierDecisionLimitsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'classifier-decision-limits',
  label: 'Classifier Decision Limits',
  description:
    'Most candidates one classifier run captures and most results one decision batch stores, per candidate kind.',
  config: classifierDecisionLimitsConfig,
  access: { update_roles: ['developer'] },
  fields: {
    topic_candidates: {
      description: 'Maximum topic candidates captured and decided by one classifier run.',
      minValue: 1,
      maxValue: CLASSIFIER_DECISION_LIMIT_MAX_VALUES.topic_candidates,
      integer: true,
    },
    story_candidates: {
      description: 'Maximum story candidates captured and decided by one classifier run.',
      minValue: 1,
      maxValue: CLASSIFIER_DECISION_LIMIT_MAX_VALUES.story_candidates,
      integer: true,
    },
    community_prompt_candidates: {
      description: 'Maximum community prompts captured and decided by one classifier run.',
      minValue: 1,
      maxValue: CLASSIFIER_DECISION_LIMIT_MAX_VALUES.community_prompt_candidates,
      integer: true,
    },
  },
})
