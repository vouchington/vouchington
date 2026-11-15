import { DynamicConfig } from '@data-stores/valkey'
import { getBoundedPositiveIntegerField } from 'valkyries/dynamic-config'

/** `questions_per_community` stays within the `order_index` CHECK range (0 to 999). */
export const COMMUNITY_APPLICATION_LIMIT_MAX_VALUES = {
  questions_per_community: 1000,
  options_per_question: 1000,
}

const DEFAULT_VALUES = { questions_per_community: 50, options_per_question: 100 }

export const communityApplicationLimitsConfig = new DynamicConfig({
  key: 'community-application-limits-config',
  fieldTypes: { questions_per_community: 'number', options_per_question: 'number' },
  defaultFields: DEFAULT_VALUES,
})

export function getCommunityApplicationLimits(): {
  questionsPerCommunity: number
  optionsPerQuestion: number
} {
  return {
    questionsPerCommunity: getBoundedPositiveIntegerField(
      communityApplicationLimitsConfig,
      'questions_per_community',
      {
        defaultValue: DEFAULT_VALUES.questions_per_community,
        maxValue: COMMUNITY_APPLICATION_LIMIT_MAX_VALUES.questions_per_community,
      },
    ),
    optionsPerQuestion: getBoundedPositiveIntegerField(
      communityApplicationLimitsConfig,
      'options_per_question',
      {
        defaultValue: DEFAULT_VALUES.options_per_question,
        maxValue: COMMUNITY_APPLICATION_LIMIT_MAX_VALUES.options_per_question,
      },
    ),
  }
}
