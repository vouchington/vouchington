import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestSystemModerationReport,
  setTestBanEvasionFlag,
} from '@voucha/test-helpers'
import crypto from 'node:crypto'
import { getModerationAnalytics } from './get-moderation-analytics.mts'

describe('getModerationAnalytics community ban-evasion scope', () => {
  it('counts a ban-evasion report only in the community that owns it', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const owner = await createTestUser()
    const suspect = await createTestUser()
    const sourceUser = await createTestUser()
    const [communityA, communityB] = await Promise.all([
      insertTestCommunity({
        createdById: owner.id,
        name: `Analytics Ban Scope A ${suffix}`,
        slug: `analytics-ban-scope-a-${suffix}`,
      }),
      insertTestCommunity({
        createdById: owner.id,
        name: `Analytics Ban Scope B ${suffix}`,
        slug: `analytics-ban-scope-b-${suffix}`,
      }),
    ])
    await Promise.all([
      insertTestCommunityMember({ communityId: communityA.id, userId: suspect.id }),
      insertTestCommunityMember({ communityId: communityB.id, userId: suspect.id }),
    ])
    await Promise.all([
      setTestBanEvasionFlag({
        communityId: communityA.id,
        userId: suspect.id,
        sourceUserId: sourceUser.id,
      }),
      setTestBanEvasionFlag({
        communityId: communityB.id,
        userId: suspect.id,
        sourceUserId: sourceUser.id,
      }),
    ])
    await insertTestSystemModerationReport(
      'user',
      suspect.id,
      'Suspected ban evasion',
      undefined,
      communityB.id,
    )

    const [metricsA, metricsB] = await Promise.all([
      getModerationAnalytics('7d', { type: 'community', communityId: communityA.id }),
      getModerationAnalytics('7d', { type: 'community', communityId: communityB.id }),
    ])

    expect(metricsA.queue_volume.total_reports).toBe(0)
    expect(metricsA.queue_volume.pending_reports).toBe(0)
    expect(metricsA.rule_violations.reasons).toEqual([])
    expect(metricsB.queue_volume.total_reports).toBe(1)
    expect(metricsB.queue_volume.pending_reports).toBe(1)
    expect(metricsB.rule_violations.reasons).toEqual([{ reason: 'other', count: 1 }])
  })
})
