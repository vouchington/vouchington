import { describe, expect, it } from 'vitest'
import { aiUsageWorkConfig, aiUsageWorkMaxValues } from '@services/ai-usage/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import * as moderation from '@services/moderation-analytics/work-limits'
import * as clearance from '@services/post-clearance/work-limits'
import * as users from '@services/users/work-limits'
import * as votes from '@services/vote-weight/work-limits'
import * as membership from '@services/memberships/work-limits'
import { dynamicConfigRegistry } from './registry.mts'
import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'

describe('bounded work namespace policy', () => {
  it('rejects missing, stale and unsafe hard ceilings', () => {
    expect(() => defineBoundedWorkNamespace(aiUsageWorkConfig, 'Test', {}, {})).toThrow('exactly')
    expect(() =>
      defineBoundedWorkNamespace(
        aiUsageWorkConfig,
        'Test',
        { ...aiUsageWorkMaxValues, obsolete: 1 },
        {},
      ),
    ).toThrow('exactly')
    expect(() =>
      defineBoundedWorkNamespace(aiUsageWorkConfig, 'Test', { release_batch_size: 0 }, {}),
    ).toThrow('ceiling')
  })
})

const additionalOwners = [
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
    read: () => votes.getVoteWeightDispatchBatchSize(),
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
      const entry = dynamicConfigRegistry.find(
        candidate => candidate.namespace === owner.config.key.slice('dynamic-config:'.length),
      )!
      expect(entry.config).toBe(owner.config)
      for (const [field, maximum] of Object.entries(owner.maxima)) {
        const fallback = (owner.config.defaultFields as Record<string, number>)[field]!
        expect(entry.fields[field]).toMatchObject({
          integer: true,
          min_value: 1,
          max_value: maximum,
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
