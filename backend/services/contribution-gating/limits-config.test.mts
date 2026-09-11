import { describe, expect, it } from 'vitest'
import { AUTHORED_CONTRIBUTION_POLICY_DEFAULTS } from './limit-defaults.mts'
import { contributionPolicyActions, contributionPolicyTiers } from './limit-types.mts'
import {
  contributionLimitConfig,
  getContributionLimitValue,
  getContributionLimitWindowSeconds,
  getContributionPolicyConfigSnapshot,
} from './limits-config.mts'

describe('contribution limit config reads', () => {
  it('returns a complete authored-policy snapshot', () => {
    const snapshot = getContributionPolicyConfigSnapshot()

    expect(snapshot.authored_post_free_short_limit).toEqual(expect.any(Number))
    expect(snapshot.topic_recommendation_safety_daily_limit).toEqual(expect.any(Number))
  })

  it('reads configured legacy limits and windows', () => {
    expect(getContributionLimitValue('community', 'free', 'daily')).toEqual(expect.any(Number))
    expect(getContributionLimitWindowSeconds('community', 'free', 'daily')).toEqual(
      expect.any(Number),
    )
  })

  it('sources every authored live default from the authored matrix', () => {
    for (const action of contributionPolicyActions) {
      for (const tier of contributionPolicyTiers) {
        const expected = AUTHORED_CONTRIBUTION_POLICY_DEFAULTS[action][tier]
        expect(contributionLimitConfig.defaultFields).toMatchObject({
          [`${action}_${tier}_short_limit`]: expected.shortLimit,
          [`${action}_${tier}_short_window_seconds`]: expected.shortWindowSeconds,
          [`${action}_${tier}_daily_limit`]: expected.dailyLimit,
          [`${action}_${tier}_daily_window_seconds`]: expected.dailyWindowSeconds,
        })
      }
    }
  })
})
