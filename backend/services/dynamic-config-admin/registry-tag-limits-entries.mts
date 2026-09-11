import { autotaggerPaidLimitsConfig } from '@services/autotagger/limits-config'
import { manualTagLimitConfig } from '@services/tag-limits/config'
import { defineDynamicConfigNamespace } from './registry-descriptor.mts'
import { TAG_LIMIT_MAX_EXEMPTION } from './registry-entry-utils.mts'
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
      pro: tagLimitField('Manual tag add limit for Pro members. Admins are unlimited (in code).'),
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
      ),
      post_plus_max_topics: tagLimitField(
        'Max autotagger topics on post creation for Plus authors.',
      ),
      post_pro_max_topics: tagLimitField(
        'Max autotagger topics on post creation for Pro authors (also applies to admin authors).',
      ),
      rss_discoverable_llm_max_topics: tagLimitField(
        'Max additional LLM-derived topics for RSS feed items from discoverable sources.',
      ),
      rss_collaborative_plus_max_topics: tagLimitField(
        'Max additional topics followed by Plus followers of the source feed (no LLM).',
      ),
      rss_collaborative_pro_max_topics: tagLimitField(
        'Max additional topics followed by Pro followers of the source feed (no LLM).',
      ),
    },
  }),
]

function tagLimitField(description: string) {
  return {
    description,
    min_value: 0,
    max_value_exemption: TAG_LIMIT_MAX_EXEMPTION,
    integer: true,
  }
}
