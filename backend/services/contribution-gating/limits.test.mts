import { RateLimiter, rateLimiterValkeyClient } from '@data-stores/valkey-rate-limiter'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  overrideDynamicConfigFieldsForTest,
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
} from '@voucha/test-helpers'
import { closeScopedDynamicConfigContext } from '@voucha/test-helpers/dynamic-config'
import { CONTRIBUTION_QUOTA_EXCEEDED } from '@modules/on-error/error-codes'
import { contributionLimitConfig } from './limits-config.mts'
import { limitKey } from './limits-helpers.mts'
import {
  assertWithinContributionActionLimit,
  assertWithinContributionDailyLimit,
  getContributionActionLimitStatus,
  getContributionLimitTier,
} from './limits.mts'

describe('contribution action limits', () => {
  const testContributionLimitFields = () =>
    Object.fromEntries(
      Object.keys(contributionLimitConfig.fieldTypes).map(name => [
        name,
        name.endsWith('_limit') ? 99_999 : contributionLimitConfig.defaultFields[name],
      ]),
    ) as Record<string, number>

  beforeAll(async () => {
    await contributionLimitConfig.waitForInitialization()
    contributionLimitConfig.unsubscribe()
  }, 30_000)

  afterEach(() => {
    overrideDynamicConfigFieldsForTest(contributionLimitConfig, testContributionLimitFields())
  })

  afterAll(async () => {
    await closeScopedDynamicConfigContext([contributionLimitConfig])
  })

  it('resolves tiers from account age, membership, and admin role', async () => {
    const newUser = await createTestUserWithAge(60_000)
    const freeUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const adminUser = await createTestUserWithAge(60_000, { administrator: true })

    expect(getContributionLimitTier(newUser, null)).toBe('just_joined')
    expect(getContributionLimitTier(freeUser, null)).toBe('free')
    expect(getContributionLimitTier(freeUser, 'plus')).toBe('plus')
    expect(getContributionLimitTier(freeUser, 'pro')).toBe('pro')
    expect(getContributionLimitTier(adminUser, null)).toBe('admin')
  })

  it('blocks when the short window limit is exceeded', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    overrideDynamicConfigFieldsForTest(contributionLimitConfig, {
      review_free_short_limit: 1,
      review_free_daily_limit: 10,
      review_free_short_window_seconds: 60,
    })

    await expect(assertWithinContributionActionLimit(user, null, 'review')).resolves.toBeUndefined()
    await expect(assertWithinContributionActionLimit(user, null, 'review')).rejects.toMatchObject({
      code: CONTRIBUTION_QUOTA_EXCEEDED,
      status: 429,
    })
  })

  it('blocks when the daily window limit is exceeded', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    overrideDynamicConfigFieldsForTest(contributionLimitConfig, {
      comment_free_short_limit: 10,
      comment_free_daily_limit: 1,
    })

    await expect(
      assertWithinContributionActionLimit(user, null, 'comment'),
    ).resolves.toBeUndefined()
    await expect(assertWithinContributionActionLimit(user, null, 'comment')).rejects.toMatchObject({
      code: CONTRIBUTION_QUOTA_EXCEEDED,
      status: 429,
    })
  })

  it('blocks actions configured with a zero limit', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    overrideDynamicConfigFieldsForTest(contributionLimitConfig, {
      review_free_short_limit: 0,
      review_free_daily_limit: 10,
    })

    await expect(assertWithinContributionActionLimit(user, null, 'review')).rejects.toMatchObject({
      code: CONTRIBUTION_QUOTA_EXCEEDED,
      status: 429,
    })
  })

  it('does not consume daily quota when the short window blocks an action', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    overrideDynamicConfigFieldsForTest(contributionLimitConfig, {
      review_free_short_limit: 1,
      review_free_daily_limit: 10,
      review_free_short_window_seconds: 60,
    })

    await assertWithinContributionActionLimit(user, null, 'review')
    await expect(assertWithinContributionActionLimit(user, null, 'review')).rejects.toMatchObject({
      code: CONTRIBUTION_QUOTA_EXCEEDED,
      status: 429,
    })

    await expect(getContributionActionLimitStatus(user, null, 'review')).resolves.toMatchObject({
      daily_window: { limit: 10, used: 1 },
    })
  })

  it('can enforce daily quota without applying the short cooldown', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    overrideDynamicConfigFieldsForTest(contributionLimitConfig, {
      topic_recommendation_free_short_limit: 1,
      topic_recommendation_free_daily_limit: 2,
    })

    await assertWithinContributionDailyLimit(user, null, 'topic_recommendation')
    await assertWithinContributionDailyLimit(user, null, 'topic_recommendation')
    await expect(
      getContributionActionLimitStatus(user, null, 'topic_recommendation'),
    ).resolves.toMatchObject({
      short_window: { limit: 1, used: 0 },
      daily_window: { limit: 2, used: 2 },
    })

    await expect(
      assertWithinContributionDailyLimit(user, null, 'topic_recommendation'),
    ).rejects.toMatchObject({
      code: CONTRIBUTION_QUOTA_EXCEEDED,
      status: 429,
    })
  })

  it('reports action-specific status without incrementing counters', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    overrideDynamicConfigFieldsForTest(contributionLimitConfig, {
      topic_recommendation_free_short_limit: 3,
      topic_recommendation_free_daily_limit: 7,
    })

    const status = await getContributionActionLimitStatus(user, null, 'topic_recommendation')
    expect(status).toMatchObject({
      action: 'topic_recommendation',
      tier: 'free',
      allowed: true,
      short_window: { limit: 3, used: 0 },
      daily_window: { limit: 7, used: 0 },
    })
  })

  it('reports usage across the configured window instead of the limiter default', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    overrideDynamicConfigFieldsForTest(contributionLimitConfig, {
      review_free_short_limit: 1,
      review_free_daily_limit: 10,
      review_free_short_window_seconds: 120,
    })
    const key = RateLimiter.getWindowKey({
      prefix: 'contribution-action-short',
      id: limitKey(user.id, 'review'),
      ttlSeconds: 120,
      threshold: 1,
    })
    await rateLimiterValkeyClient.customCommand([
      'ZADD',
      key,
      String(Date.now() - 90_000),
      crypto.randomUUID(),
    ])

    await expect(getContributionActionLimitStatus(user, null, 'review')).resolves.toMatchObject({
      allowed: false,
      short_window: { used: 1, window_seconds: 120 },
    })
  })

  it('reports blocked status when the next action would exceed the limit', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    overrideDynamicConfigFieldsForTest(contributionLimitConfig, {
      review_free_short_limit: 1,
      review_free_daily_limit: 10,
      review_free_short_window_seconds: 60,
    })

    await assertWithinContributionActionLimit(user, null, 'review')

    await expect(getContributionActionLimitStatus(user, null, 'review')).resolves.toMatchObject({
      allowed: false,
      short_window: { limit: 1, used: 1 },
    })
  })

  it('treats admin limits as unlimited', async () => {
    const adminUser = await createTestUserWithAge(60_000, { administrator: true })
    overrideDynamicConfigFieldsForTest(contributionLimitConfig, {
      review_admin_short_limit: -1,
      review_admin_daily_limit: -1,
    })

    await expect(
      assertWithinContributionActionLimit(adminUser, null, 'review'),
    ).resolves.toBeUndefined()
    const status = await getContributionActionLimitStatus(adminUser, null, 'review')
    expect(status.short_window.limit).toBe(-1)
    expect(status.daily_window.limit).toBe(-1)
  })
})
