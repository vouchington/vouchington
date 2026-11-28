import {
  REFERRAL_LINK_VALIDATION_LIMIT_MAX_VALUES,
  referralLinkValidationLimitsConfig,
} from '@services/topics/referral-link-validation-limits'
import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'

export const referralLinkValidationLimitsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'referral-link-validation-limits-config',
  label: 'Referral Link Validation Limits',
  description:
    'Caps for referral program link validation rule sets, rules, and cursor batch sizes.',
  config: referralLinkValidationLimitsConfig,
  access: { update_roles: ['developer'] },
  fields: {
    rule_sets_per_program: {
      description: 'Maximum link validation rule sets linked to one referral program.',
      minValue: 1,
      maxValue: REFERRAL_LINK_VALIDATION_LIMIT_MAX_VALUES.rule_sets_per_program,
      integer: true,
    },
    rules_per_rule_set: {
      description: 'Maximum validation rules stored in one link validation rule set.',
      minValue: 1,
      maxValue: REFERRAL_LINK_VALIDATION_LIMIT_MAX_VALUES.rules_per_rule_set,
      integer: true,
    },
    rule_cursor_batch_size: {
      description: 'Cursor batch size used when streaming enabled referral link validation rules.',
      minValue: 1,
      maxValue: REFERRAL_LINK_VALIDATION_LIMIT_MAX_VALUES.rule_cursor_batch_size,
      integer: true,
    },
  },
})
