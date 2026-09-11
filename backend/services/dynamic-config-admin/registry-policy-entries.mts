import { bloomFilterConfig } from '@services/bloom-filter-config'
import {
  contributionLimitConfig,
  contributionLimitFieldMetadata,
} from '@services/contribution-gating/limits-config'
import { validateContributionLimitConfig } from '@services/contribution-gating/limit-validation'
import { routeRateLimitConfig } from '@services/route-rate-limits/config'
import { rateLimitConfig } from '@services/user-rate-limits/config'
import { voteWeightConfig } from '@services/vote-weight/config'
import { DynamicConfigValidationError } from './namespace.mts'
import {
  RATE_LIMIT_MAX_EXEMPTION,
  VOTE_WEIGHT_MAX_EXEMPTION,
  withMaxValueExemption,
} from './registry-entry-utils.mts'
import { defineDynamicConfigNamespace } from './registry-descriptor.mts'
import { routeRateLimitFields } from './route-rate-limit-fields.mts'
import { validateRateLimitThresholdConfig } from './registry-membership-limit-validators.mts'
import { validatePositiveNumberFields, validateVoteWeightConfig } from './registry-validators.mts'

export const policyDynamicConfigRegistryEntries = [
  defineDynamicConfigNamespace({
    namespace: 'vote-weight-config',
    label: 'Vote Weight',
    description: 'Vote weight multipliers and account-age thresholds.',
    config: voteWeightConfig,
    access: { update_roles: ['developer'] },
    fields: withMaxValueExemption(
      {
        multiplier_mfa: { description: 'Vote multiplier for users with MFA enabled.' },
        multiplier_has_oauth: {
          description: 'Vote multiplier for users with at least one OAuth account.',
        },
        multiplier_2_plus_oauth: {
          description: 'Vote multiplier for users with two or more OAuth accounts.',
        },
        multiplier_oauth_1_year: {
          description: 'Vote multiplier for OAuth accounts older than one year.',
        },
        multiplier_oauth_5_years: {
          description: 'Vote multiplier for OAuth accounts older than five years.',
        },
        multiplier_account_30_days: {
          description: 'Account-age multiplier applied after the 30 day threshold.',
        },
        multiplier_account_1_year: {
          description: 'Account-age multiplier applied after the one year threshold.',
        },
        multiplier_account_2_years: {
          description: 'Account-age multiplier applied after the two year threshold.',
        },
        multiplier_account_5_years: {
          description: 'Account-age multiplier applied after the five year threshold.',
        },
        weight_new_account: { description: 'Base vote weight for accounts newer than seven days.' },
        threshold_7_days_ms: {
          description: 'Account-age threshold for the seven day weight tier.',
        },
        threshold_30_days_ms: { description: 'Account-age threshold for the 30 day weight tier.' },
        threshold_1_year_ms: { description: 'Account-age threshold for the one year weight tier.' },
        threshold_2_years_ms: {
          description: 'Account-age threshold for the two year weight tier.',
        },
        threshold_5_years_ms: {
          description: 'Account-age threshold for the five year weight tier.',
        },
        multiplier_plus: { description: 'Vote multiplier for Plus members.' },
        multiplier_pro: { description: 'Vote multiplier for Pro members.' },
        multiplier_admin: { description: 'Vote multiplier for administrators.' },
      },
      VOTE_WEIGHT_MAX_EXEMPTION,
    ),
    validate: validateVoteWeightConfig,
  }),
  defineDynamicConfigNamespace({
    namespace: 'rate-limit-thresholds',
    label: 'User Rate Limits',
    description: 'Authenticated user rate-limit thresholds and TTLs.',
    config: rateLimitConfig,
    access: { update_roles: [] },
    fields: userRateLimitFields(),
    validate: validateRateLimitThresholdConfig,
  }),
  defineDynamicConfigNamespace({
    namespace: 'route-rate-limit-config',
    label: 'Route Rate Limits',
    description: 'Anonymous route rate-limit thresholds and TTLs.',
    config: routeRateLimitConfig,
    access: { update_roles: [] },
    fields: routeRateLimitFields(),
    validate: validatePositiveNumberFields,
  }),
  defineDynamicConfigNamespace({
    namespace: 'contribution-rate-limits',
    label: 'Contribution Rate Limits',
    description: 'Per-action contribution cooldown and daily limits by user tier.',
    config: contributionLimitConfig,
    access: { update_roles: [] },
    fields: contributionLimitFieldMetadata(),
    validate: next =>
      validateContributionLimitConfig(next, message => new DynamicConfigValidationError(message)),
  }),
  defineDynamicConfigNamespace({
    namespace: 'bloom-filter-config',
    label: 'Bloom Filters',
    description: 'Runtime enablement for Valkey-backed bloom filters.',
    config: bloomFilterConfig,
    access: { update_roles: ['developer'] },
    fields: {
      entityCacheBloomFilterEnabled: { description: 'Use bloom filters for entity cache lookups.' },
      embeddingBloomFilterEnabled: {
        description: 'Use bloom filters for embedding lookup checks.',
      },
      urlBlocklistBloomFilterEnabled: {
        description: 'Use bloom filters for URL blocklist checks.',
      },
      emailBlocklistBloomFilterEnabled: {
        description: 'Use bloom filters for email domain blocklist checks.',
      },
      bookmarkBloomFilterEnabled: {
        description: 'Use bloom filters for bookmark existence checks.',
      },
      apiKeyBloomFilterEnabled: { description: 'Use bloom filters for API key validation checks.' },
    },
  }),
]

function userRateLimitFields() {
  const fields = Object.fromEntries(
    ['read', 'write', 'sensitive'].flatMap(kind =>
      ['tier0', 'tier1', 'tier2', 'tier3', 'tier4', 'tier5'].map(tier => [
        `${kind}_${tier}`,
        {
          description: `${kind[0]!.toUpperCase()}${kind.slice(1)} request threshold for ${formatTrustTier(tier)}.`,
        },
      ]),
    ),
  )
  return withMaxValueExemption(
    {
      ...fields,
      read_ttl: rateLimitTtlField('Read'),
      write_ttl: rateLimitTtlField('Write'),
      sensitive_ttl: rateLimitTtlField('Sensitive action'),
    },
    RATE_LIMIT_MAX_EXEMPTION,
  )
}

function rateLimitTtlField(label: string) {
  return {
    description: `${label} rate-limit window length in seconds.`,
    max_value_exemption: RATE_LIMIT_MAX_EXEMPTION,
  }
}

function formatTrustTier(tier: string): string {
  if (tier === 'tier0') return 'unauthenticated or lowest-trust users'
  return `trust tier ${tier.slice('tier'.length)} users`
}
