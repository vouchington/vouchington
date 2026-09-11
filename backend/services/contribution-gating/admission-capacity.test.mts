import { describe, expect, it, vi } from 'vitest'
import {
  beginTransaction,
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  enableQueryCapture,
  getContributionAdmissionConsumptionModeForTest,
  insertLegacyContributionAdmissionConsumptionForTest,
  stopTestQueryCapture,
} from '@voucha/test-helpers'
import { CONTRIBUTION_QUOTA_EXCEEDED } from '@modules/on-error/error-codes'
import { runContributionAdmission } from './admission.mts'
import { getContributionAdmissionCapacityStatus } from './admission-capacity-status.mts'
import { recordContributionAdmissionConsumption } from './admission-quota.mts'
import type { ContributionDailyOnlyPolicy, ContributionPolicy } from './policy.mts'

function policy(globalLimit: number, typeLimit: number): ContributionPolicy {
  return {
    global: {
      short: { limit: globalLimit, windowSeconds: 3_600 },
      daily: { limit: globalLimit, windowSeconds: 86_400 },
    },
    type: {
      short: { limit: typeLimit, windowSeconds: 3_600 },
      daily: { limit: typeLimit, windowSeconds: 86_400 },
    },
  }
}

function dailyOnlyPolicy(globalLimit: number, typeLimit: number): ContributionDailyOnlyPolicy {
  return {
    kind: 'daily_only',
    global: { limit: globalLimit, windowSeconds: 86_400 },
    type: { limit: typeLimit, windowSeconds: 86_400 },
  }
}

describe('contribution admission capacity status', () => {
  it('counts daily-only imports in daily capacity but not either short window', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const dailyOnlyPolicy = {
      kind: 'daily_only' as const,
      global: { limit: 2, windowSeconds: 86_400 },
      type: { limit: 2, windowSeconds: 86_400 },
    }
    const standardPolicy: ContributionPolicy = {
      global: {
        short: { limit: 1, windowSeconds: 3_600 },
        daily: { limit: 2, windowSeconds: 86_400 },
      },
      type: {
        short: { limit: 1, windowSeconds: 3_600 },
        daily: { limit: 2, windowSeconds: 86_400 },
      },
    }
    const dailyOnlyKey = crypto.randomUUID()
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: dailyOnlyKey,
        intent: { request: crypto.randomUUID() },
        source: 'topic_recommendation',
        policy: dailyOnlyPolicy,
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).resolves.toMatchObject({ kind: 'created' })
    await expect(
      getContributionAdmissionConsumptionModeForTest({
        actorId: user.id,
        idempotencyKey: dailyOnlyKey,
      }),
    ).resolves.toBe('daily_only')
    await expect(
      getContributionAdmissionCapacityStatus(user.id, 'topic_recommendation', standardPolicy),
    ).resolves.toEqual({ allowed: true })

    const standardKey = crypto.randomUUID()
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: standardKey,
        intent: { request: crypto.randomUUID() },
        source: 'topic_recommendation',
        policy: standardPolicy,
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).resolves.toMatchObject({ kind: 'created' })
    await expect(
      getContributionAdmissionConsumptionModeForTest({
        actorId: user.id,
        idempotencyKey: standardKey,
      }),
    ).resolves.toBe('all_windows')

    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: crypto.randomUUID(),
        intent: { request: crypto.randomUUID() },
        source: 'topic_recommendation',
        policy: {
          ...standardPolicy,
          global: {
            short: { limit: -1, windowSeconds: 3_600 },
            daily: standardPolicy.global.daily,
          },
          type: { short: { limit: -1, windowSeconds: 3_600 }, daily: standardPolicy.type.daily },
        },
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).rejects.toMatchObject({ code: CONTRIBUTION_QUOTA_EXCEEDED, status: 429 })
  })

  it('reports the most actionable exhausted capacity with a retry time', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const limits = policy(1, 1)
    await runContributionAdmission({
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { request: crypto.randomUUID() },
      source: 'discussion',
      policy: limits,
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })

    const exhausted = await getContributionAdmissionCapacityStatus(
      user.id,
      'rss_item_discussion',
      limits,
    )
    expect(exhausted).toMatchObject({ allowed: false, reason: 'type_limit' })
    expect(exhausted.retryAfterSeconds).toBeGreaterThan(0)
    await expect(
      getContributionAdmissionCapacityStatus(user.id, 'discussion', policy(-1, -1)),
    ).resolves.toEqual({ allowed: true })
  })

  it('reads every capacity window in one status query', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    enableQueryCapture()
    try {
      await expect(
        getContributionAdmissionCapacityStatus(user.id, 'discussion', policy(1, 1)),
      ).resolves.toEqual({ allowed: true })
    } finally {
      const queries = stopTestQueryCapture().filter(query =>
        query.text.includes('queryContributionAdmissionCapacityStatus'),
      )
      expect(queries).toHaveLength(1)
      expect(queries[0]?.text.match(/FROM post_admission_quota_consumptions/g)).toHaveLength(1)
    }
  })

  it('uses the oldest retained admission among the latest limit rows as the retry boundary', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const now = Date.now()
    const committedAt = [
      new Date(now - 3_000_000),
      new Date(now - 1_800_000),
      new Date(now - 600_000),
    ]
    for (const date of committedAt) {
      await using query = await beginTransaction()
      await recordContributionAdmissionConsumption(
        query,
        crypto.randomUUID(),
        user.id,
        'discussion',
        date,
        'all_windows',
      )
      await query.commit()
    }
    await using query = await beginTransaction()
    await recordContributionAdmissionConsumption(
      query,
      crypto.randomUUID(),
      user.id,
      'topic_recommendation',
      new Date(now - 10_000),
      'daily_only',
    )
    await query.commit()

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now + 86_400_000)
    let exhausted: Awaited<ReturnType<typeof getContributionAdmissionCapacityStatus>>
    try {
      exhausted = await getContributionAdmissionCapacityStatus(user.id, 'discussion', {
        ...policy(2, -1),
        global: {
          short: { limit: 2, windowSeconds: 3_600 },
          daily: { limit: -1, windowSeconds: 86_400 },
        },
      })
    } finally {
      vi.useRealTimers()
    }

    expect(exhausted).toMatchObject({ allowed: false, reason: 'global_limit' })
    expect(exhausted.retryAfterSeconds).toBeGreaterThanOrEqual(1_780)
    expect(exhausted.retryAfterSeconds).toBeLessThanOrEqual(1_802)
  })

  it('keeps daily-only admissions out of authored short windows and retry boundaries', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const dailyOnly = dailyOnlyPolicy(2, 2)
    await runContributionAdmission({
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { request: crypto.randomUUID() },
      source: 'topic_recommendation',
      policy: dailyOnly,
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    const normalPolicy = {
      ...policy(1, -1),
      global: {
        short: { limit: 1, windowSeconds: 3_600 },
        daily: { limit: -1, windowSeconds: 86_400 },
      },
    }
    await expect(
      getContributionAdmissionCapacityStatus(user.id, 'discussion', normalPolicy),
    ).resolves.toEqual({ allowed: true })
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: crypto.randomUUID(),
        intent: { request: crypto.randomUUID() },
        source: 'discussion',
        policy: normalPolicy,
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).resolves.toMatchObject({ kind: 'created' })
    const exhausted = await getContributionAdmissionCapacityStatus(
      user.id,
      'discussion',
      normalPolicy,
    )
    expect(exhausted).toMatchObject({ allowed: false, reason: 'global_limit' })
    expect(exhausted.retryAfterSeconds).toBeGreaterThan(0)
    expect(exhausted.retryAfterSeconds).toBeLessThanOrEqual(3_600)
  })

  it('counts daily-only admissions in daily capacity', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    await runContributionAdmission({
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { request: crypto.randomUUID() },
      source: 'topic_recommendation',
      policy: dailyOnlyPolicy(1, 1),
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    })
    await expect(
      runContributionAdmission({
        actorId: user.id,
        idempotencyKey: crypto.randomUUID(),
        intent: { request: crypto.randomUUID() },
        source: 'discussion',
        policy: {
          ...policy(-1, -1),
          global: {
            short: { limit: -1, windowSeconds: 3_600 },
            daily: { limit: 1, windowSeconds: 86_400 },
          },
        },
        execute: async () => ({ post: { id: crypto.randomUUID() } }),
      }),
    ).rejects.toMatchObject({ code: 'CONTRIBUTION_QUOTA_EXCEEDED', status: 429 })
  })

  it('treats an old writer row without a mode as all-window consumption', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    await insertLegacyContributionAdmissionConsumptionForTest({
      actorId: user.id,
      source: 'discussion',
    })

    await expect(
      getContributionAdmissionCapacityStatus(user.id, 'discussion', {
        ...policy(1, -1),
        global: {
          short: { limit: 1, windowSeconds: 3_600 },
          daily: { limit: -1, windowSeconds: 86_400 },
        },
      }),
    ).resolves.toMatchObject({ allowed: false, reason: 'global_limit' })
  })
})
