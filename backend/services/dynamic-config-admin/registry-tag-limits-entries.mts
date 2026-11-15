import {
  autotaggerPaidLimitsConfig,
  MAX_AUTOTAGGER_TOPICS,
} from '@services/autotagger/limits-config'
import { manualTagLimitConfig, MAX_MANUAL_TAGS } from '@services/tag-limits/config'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'
import { validateAutotaggerPaidLimitsConfig } from './autotagger-paid-limits-validation.mts'
import { validateMembershipPlanLimits } from './registry-membership-limit-validators.mts'

export const tagLimitsDynamicConfigRegistryEntries = [
  defineDynamicConfigNamespace({
    namespace: 'manual-tag-limits',
    label: 'Manual Tag Limits',
    description:
      'Standing per-relation caps on tags a user may manually add (#8246). Does not affect voting on existing tags.',
    config: manualTagLimitConfig,
    access: { update_roles: [] },
    validate: next => validateMembershipPlanLimits(next, ['free', 'plus', 'pro']),
    fields: {
      just_joined: tagLimitField('Manual tag add limit for just-joined accounts.'),
      free: tagLimitField('Manual tag add limit for free-tier users.'),
      plus: tagLimitField('Manual tag add limit for Plus members.'),
      pro: tagLimitField(
        'Manual tag add limit for Pro members. Administrators use the fixed manual-category ceiling.',
      ),
    },
  }),
  defineDynamicConfigNamespace({
    namespace: 'autotagger-paid-limits',
    label: 'Autotagger Paid Limits',
    description:
      'Paid-tier caps on topics the autotagger LLM agent may add to posts and RSS feed items (#8246).',
    config: autotaggerPaidLimitsConfig,
    access: { update_roles: [] },
    validate: next => {
      validateMembershipPlanLimits(next, [
        'post_free_max_topics',
        'post_plus_max_topics',
        'post_pro_max_topics',
      ])
      validateAutotaggerPaidLimitsConfig(next)
    },
    fields: {
      enabled: { description: 'Master switch for the autotagger agent.' },
      post_free_max_topics: tagLimitField(
        'Max autotagger topics on post creation for free-tier authors. 0 skips the LLM call entirely.',
        MAX_AUTOTAGGER_TOPICS,
      ),
      post_plus_max_topics: tagLimitField(
        'Max autotagger topics on post creation for Plus authors.',
        MAX_AUTOTAGGER_TOPICS,
      ),
      post_pro_max_topics: tagLimitField(
        'Max autotagger topics on post creation for Pro authors (also applies to admin authors).',
        MAX_AUTOTAGGER_TOPICS,
      ),
      rss_discoverable_llm_max_topics: tagLimitField(
        'Max additional LLM-derived topics for RSS feed items from discoverable sources.',
        MAX_AUTOTAGGER_TOPICS,
      ),
      rss_collaborative_plus_max_topics: tagLimitField(
        'Max additional topics followed by Plus followers of the source feed (no LLM).',
        MAX_AUTOTAGGER_TOPICS,
      ),
      rss_collaborative_pro_max_topics: tagLimitField(
        'Max additional topics followed by Pro followers of the source feed (no LLM).',
        MAX_AUTOTAGGER_TOPICS,
      ),
      agent_max_turns: agentBoundField(
        'Most model turns one reasoning autotagger run may take. The run ends with no topics added when it spends them without answering.',
        20,
      ),
      agent_max_tool_calls: agentBoundField(
        'Most tool calls (topic searches) one reasoning autotagger run may make across all turns.',
        50,
      ),
      agent_max_output_tokens: agentBoundField(
        'Most output tokens one reasoning autotagger run may spend across all turns; also caps each turn.',
        20_000,
      ),
    },
  }),
]

function tagLimitField(description: string, maxValue = MAX_MANUAL_TAGS) {
  return {
    description,
    minValue: 0,
    maxValue,
    integer: true,
  }
}

function agentBoundField(description: string, maxValue: number) {
  return { description, minValue: 1, maxValue: maxValue, integer: true }
}
