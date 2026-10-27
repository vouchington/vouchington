import { describe, expect, it } from 'vitest'
import { aiUsageWorkConfig, aiUsageWorkMaxValues } from '@services/ai-usage/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import * as moderation from '@services/moderation-analytics/work-limits'
import * as clearance from '@services/post-clearance/work-limits'
import * as users from '@services/users/work-limits'
import * as votes from '@services/vote-weight/work-limits'
import * as oauth from '@services/oauth/work-limits'
import * as membership from '@services/memberships/work-limits'
import { dynamicConfigRegistry } from './registry.mts'
import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'

describe('bounded work namespace policy', () => {
  const options = {
    namespace: 'ai-usage-work-config',
    config: aiUsageWorkConfig,
    label: 'Test',
    maxValues: aiUsageWorkMaxValues,
    descriptions: {},
  }
  it('rejects missing, stale and unsafe hard ceilings', () => {
    expect(() => defineBoundedWorkNamespace({ ...options, maxValues: {} })).toThrow('exactly')
    expect(() =>
      defineBoundedWorkNamespace({
        ...options,
        maxValues: { ...aiUsageWorkMaxValues, obsolete: 1 },
      }),
    ).toThrow('exactly')
    expect(() =>
      defineBoundedWorkNamespace({
        ...options,
        maxValues: { release_batch_size: 0 },
      }),
    ).toThrow('ceiling')
  })
  it('rejects an explicit namespace that differs from the runtime configuration identity', () => {
    expect(() =>
      defineBoundedWorkNamespace({ ...options, namespace: 'unrelated-work-config' }),
    ).toThrow('must match its DynamicConfig key')
  })
  it('keeps a caller-specified safety minimum in the registry', () => {
    const entry = defineBoundedWorkNamespace({
      ...options,
      minValues: { release_batch_size: 50 },
      descriptions: { release_batch_size: 'Rows per release page.' },
    })
    expect(entry.fields.release_batch_size?.minValue).toBe(50)
    expect(() =>
      defineBoundedWorkNamespace({ ...options, minValues: { release_batch_size: 101 } }),
    ).toThrow('default or ceiling')
    expect(() => defineBoundedWorkNamespace({ ...options, minValues: { obsolete: 50 } })).toThrow(
      'unknown field',
    )
  })
})

const additionalOwners = [
  {
    config: oauth.oauthAuthorizationExchangeWorkConfig,
    maxima: oauth.oauthAuthorizationExchangeWorkMaxValues,
    read: (field: string) =>
      oauth.getOAuthAuthorizationExchangeWorkLimit(
        field as keyof typeof oauth.oauthAuthorizationExchangeWorkMaxValues,
      ),
  },
  {
    config: moderation.moderationAnalyticsWorkConfig,
    maxima: moderation.moderationAnalyticsWorkMaxValues,
    read: (field: string) =>
      moderation.getModerationAnalyticsWorkLimit(
        field as keyof typeof moderation.moderationAnalyticsWorkMaxValues,
      ),
  },
  {
    config: clearance.postClearanceWorkConfig,
    maxima: clearance.postClearanceWorkMaxValues,
    read: (field: string) =>
      clearance.getPostClearanceWorkLimit(
        field as keyof typeof clearance.postClearanceWorkMaxValues,
      ),
  },
  {
    config: users.usersWorkConfig,
    maxima: users.usersWorkMaxValues,
    read: (field: string) =>
      users.getUsersWorkLimit(field as keyof typeof users.usersWorkMaxValues),
  },
  {
    config: votes.voteWeightWorkConfig,
    maxima: votes.voteWeightWorkMaxValues,
    read: (field: string) =>
      field === 'dispatch_batch_size'
        ? votes.getVoteWeightDispatchBatchSize()
        : field.endsWith('_lookback_seconds')
          ? votes.getVoteWeightLookbackSeconds(
              field.replace('_lookback_seconds', '') as
                | 'age_milestones'
                | 'membership_expirations'
                | 'family_source_changes',
            )
          : votes.getVoteWeightDispatchBatchSize(),
  },
  {
    config: membership.membershipWorkConfig,
    maxima: membership.membershipAdditionalWorkMaxValues,
    read: (field: string) =>
      membership.getMembershipWorkLimit(
        field as keyof typeof membership.membershipAdditionalWorkMaxValues,
      ),
  },
]

describe('additional bounded work namespaces', () => {
  it('registers additional owner fields and reads bounded live overrides', () => {
    for (const owner of additionalOwners) {
      const entry = dynamicConfigRegistry.entries.find(
        candidate => candidate.namespace === owner.config.key.slice('dynamic-config:'.length),
      )!
      expect(entry.config).toBe(owner.config)
      for (const [field, maximum] of Object.entries(owner.maxima)) {
        const fallback = (owner.config.defaultFields as Record<string, number>)[field]!
        expect(entry.fields[field]).toMatchObject({
          integer: true,
          minValue: 1,
          maxValue: maximum,
        })
        expect(fallback).toBeLessThanOrEqual(maximum)
        const restore = overrideDynamicConfigFieldsForTest(owner.config, { [field]: 1 })
        try {
          expect(owner.read(field)).toBe(1)
          overrideDynamicConfigFieldsForTest(owner.config, { [field]: maximum })
          expect(owner.read(field)).toBe(maximum)
          overrideDynamicConfigFieldsForTest(owner.config, { [field]: maximum + 1 })
          expect(owner.read(field)).toBe(fallback)
        } finally {
          restore()
        }
      }
    }
  })
})
