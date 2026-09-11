import { describe, expect, it } from 'vitest'
import { mintUUIDv7 } from '@modules/utils/ids'
import { AUTHORED_CONTRIBUTION_POLICY_DEFAULTS } from './limit-defaults.mts'
import { contributionLimitActions } from './limit-types.mts'
import { createContributionPolicyActor } from './policy-actor.mts'
import * as contributionGating from './index.mts'
import * as policy from './policy.mts'

function snapshot(): Record<string, number> {
  return Object.fromEntries(
    Object.entries(AUTHORED_CONTRIBUTION_POLICY_DEFAULTS).flatMap(([action, tiers]) =>
      Object.entries(tiers).flatMap(([tier, value]) => [
        [`${action}_${tier}_short_limit`, value.shortLimit],
        [`${action}_${tier}_short_window_seconds`, value.shortWindowSeconds],
        [`${action}_${tier}_daily_limit`, value.dailyLimit],
        [`${action}_${tier}_daily_window_seconds`, value.dailyWindowSeconds],
      ]),
    ),
  )
}

describe('contribution policy', () => {
  it('ships the exact Safety/Pro/Plus/Free matrix for every authored bucket', () => {
    const matrix = Object.fromEntries(
      Object.entries(AUTHORED_CONTRIBUTION_POLICY_DEFAULTS).map(([action, tiers]) => [
        action,
        Object.fromEntries(
          Object.entries(tiers).map(([tier, value]) => [
            tier,
            [value.shortLimit, value.shortWindowSeconds, value.dailyLimit],
          ]),
        ),
      ]),
    )
    expect(matrix).toEqual({
      authored_post: {
        safety: [1, 300, 50],
        pro: [1, 300, 50],
        plus: [1, 600, 25],
        free: [1, 900, 10],
      },
      review: { safety: [1, 600, 3], pro: [1, 600, 3], plus: [1, 1800, 2], free: [1, 3600, 1] },
      comment: { safety: [1, 300, 50], pro: [1, 300, 50], plus: [1, 600, 25], free: [1, 900, 10] },
      discussion: {
        safety: [1, 900, 10],
        pro: [1, 900, 10],
        plus: [1, 1800, 5],
        free: [1, 3600, 3],
      },
      topic_recommendation: {
        safety: [1, 900, 10],
        pro: [1, 900, 10],
        plus: [1, 1800, 5],
        free: [1, 3600, 3],
      },
      data_point: {
        safety: [1, 900, 20],
        pro: [1, 900, 20],
        plus: [1, 1800, 10],
        free: [1, 3600, 5],
      },
    })
  })

  it('keeps aggregate, safety, and raw system minting out of public exports', () => {
    expect(contributionLimitActions).toEqual([
      'topic',
      'topic_recommendation',
      'discussion',
      'review',
      'comment',
      'data_point',
      'article',
      'blog_post',
      'community',
      'rss_feed',
      'post_rating',
      'fediverse_instance',
    ])
    expect(policy).not.toHaveProperty('mintVerifiedSystemContributionPolicyActor')
    expect(contributionGating).not.toHaveProperty('mintVerifiedSystemContributionPolicyActor')
    expect(contributionLimitActions).not.toContain('authored_post')
    expect(contributionLimitActions).not.toContain('safety')
  })

  it('uses a real runtime brand while resolving every authored matrix cell', () => {
    const config = snapshot()
    const profiles = {
      free: createContributionPolicyActor('not-a-uuid', null),
      plus: createContributionPolicyActor('not-a-uuid', 'plus'),
      pro: createContributionPolicyActor('not-a-uuid', 'pro'),
    }
    for (const [tier, actor] of Object.entries(profiles) as Array<
      ['free' | 'plus' | 'pro', ReturnType<typeof createContributionPolicyActor>]
    >) {
      for (const [source, expected] of Object.entries(AUTHORED_CONTRIBUTION_POLICY_DEFAULTS)) {
        if (source === 'authored_post') continue
        const resolved = policy.resolveContributionPolicy(config, actor, source as never)
        expect(resolved).toMatchObject({
          global: {
            short: { limit: AUTHORED_CONTRIBUTION_POLICY_DEFAULTS.authored_post[tier].shortLimit },
            daily: { limit: AUTHORED_CONTRIBUTION_POLICY_DEFAULTS.authored_post[tier].dailyLimit },
          },
          type: {
            short: { limit: expected[tier].shortLimit },
            daily: { limit: expected[tier].dailyLimit },
          },
        })
      }
    }
  })

  it('builds daily-only policies without a short-window field', () => {
    const actor = createContributionPolicyActor('not-a-uuid', null)
    const full = policy.resolveContributionPolicy(snapshot(), actor, 'topic_recommendation')
    const dailyOnly = policy.resolveContributionDailyOnlyPolicy(
      snapshot(),
      actor,
      'topic_recommendation',
    )

    expect(dailyOnly).toEqual({
      kind: 'daily_only',
      global: full.global.daily,
      type: full.type.daily,
    })
    expect(dailyOnly.global).not.toHaveProperty('short')
    expect(dailyOnly.type).not.toHaveProperty('short')
  })

  it('maps links, stories, and RSS-item discussions to discussion', () => {
    const actor = createContributionPolicyActor('not-a-uuid', null)
    const discussion = policy.resolveContributionPolicy(snapshot(), actor, 'discussion')
    for (const source of ['link', 'story', 'rss_item_discussion'] as const) {
      expect(policy.resolveContributionPolicy(snapshot(), actor, source)).toEqual(discussion)
    }
  })

  it('blocks just-joined actors without exposing an exemption mint', () => {
    const joined = createContributionPolicyActor(mintUUIDv7(), null)
    expect(policy.resolveContributionPolicy(snapshot(), joined, 'review')).toMatchObject({
      global: { short: { limit: 0 } },
      type: { daily: { limit: 0 } },
    })
    expect(joined).not.toHaveProperty('exempt')
  })

  it('keeps article/blog exemptions outside the policy resolver', () => {
    const actor = createContributionPolicyActor('not-a-uuid', null)
    expect(() => policy.resolveContributionPolicy(snapshot(), actor, 'article')).toThrow(
      'verify its exemption before resolving',
    )
    expect(() => policy.resolveContributionPolicy(snapshot(), actor, 'blog_post')).toThrow(
      'verify its exemption before resolving',
    )
  })
})
