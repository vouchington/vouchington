import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserWithAge,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import {
  contributionLimitConfig,
  getContributionPolicyConfigSnapshot,
} from '@services/contribution-gating/limits-config'
import { assertWithinContributionActionLimit } from '@services/contribution-gating/limits'
import { runContributionAdmission } from '@services/contribution-gating/admission'
import { createContributionPolicyActor } from '@services/contribution-gating/policy-actor'
import { resolveContributionPolicy } from '@services/contribution-gating/policy'
import type { PrivateUser } from '@services/users/types'

const testContributionLimitFields = () =>
  Object.fromEntries(
    Object.keys(contributionLimitConfig.fieldTypes).map(name => [
      name,
      name.endsWith('_limit') ? 99_999 : contributionLimitConfig.defaultFields[name],
    ]),
  ) as Record<string, number>

describe('GET /api/v1/my/contribution-status', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/contribution-status').expect(401)
  })

  it('returns contribution_status and daily_quota for authenticated user', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/contribution-status').expect(200)

    expect(response.body.contribution_status).toBeDefined()
    expect(typeof response.body.contribution_status.allowed).toBe('boolean')

    expect(response.body.daily_quota).toBeDefined()
    expect(typeof response.body.daily_quota.limit).toBe('number')
    expect(typeof response.body.daily_quota.used).toBe('number')
    expect(response.body).not.toHaveProperty('action_limit')
  })

  it('gates newly created free accounts', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/contribution-status').expect(200)

    // Freshly created test user → account < 7 days old → gated
    expect(response.body.contribution_status.allowed).toBe(false)
    expect(response.body.contribution_status.reason).toBe('account_too_new')
    expect(response.body.contribution_status.gated_until).toBeDefined()
  })

  it('returns free quota limit (10) for free users', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/contribution-status').expect(200)

    expect(response.body.daily_quota.limit).toBe(10)
    expect(response.body.daily_quota.used).toBeGreaterThanOrEqual(0)
  })

  it('returns action-specific limits when action is provided', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    overrideDynamicConfigFieldsForTest(
      contributionLimitConfig,
      contributionLimitConfig.defaultFields as Record<string, number>,
    )
    try {
      const response = await request.get('/api/v1/my/contribution-status?action=review').expect(200)

      expect(response.body.action_limit).toMatchObject({
        action: 'review',
        tier: 'just_joined',
        daily_window: { limit: 0 },
      })
      expect(response.body.daily_quota.limit).toBe(0)
    } finally {
      overrideDynamicConfigFieldsForTest(contributionLimitConfig, testContributionLimitFields())
    }
  })

  it('keeps admission independent from the retired action-window counter', async () => {
    const restore = overrideDynamicConfigFieldsForTest(contributionLimitConfig, {
      review_free_short_limit: 1,
      review_free_daily_limit: 10,
      review_free_short_window_seconds: 60,
    })
    const contributingUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(contributingUser)
    try {
      await assertWithinContributionActionLimit(contributingUser, null, 'review')
      const response = await request.get('/api/v1/my/contribution-status?action=review').expect(200)
      expect(response.body).toMatchObject({
        contribution_status: { allowed: true },
        action_limit: { allowed: false },
        admission: { allowed: true },
      })
    } finally {
      restore()
    }
  })

  it('reports exhausted PostgreSQL review admission while action_limit remains allowed', async () => {
    const restore = overrideDynamicConfigFieldsForTest(contributionLimitConfig, {
      authored_post_free_short_limit: 1,
      authored_post_free_daily_limit: 1,
      review_free_short_limit: 2,
      review_free_daily_limit: 2,
    })
    const contributingUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(contributingUser)
    try {
      await recordAdmission(contributingUser, 'review')

      const response = await request.get('/api/v1/my/contribution-status?action=review').expect(200)

      expect(response.body).toMatchObject({
        action_limit: { allowed: true },
        admission: { allowed: false, reason: 'global_limit' },
      })
    } finally {
      restore()
    }
  })

  it('reports exhausted PostgreSQL discussion admission without an action limit', async () => {
    const restore = overrideDynamicConfigFieldsForTest(contributionLimitConfig, {
      authored_post_free_short_limit: 1,
      authored_post_free_daily_limit: 1,
      discussion_free_short_limit: 2,
      discussion_free_daily_limit: 2,
    })
    const contributingUser = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(contributingUser)
    try {
      await recordAdmission(contributingUser, 'discussion')

      const response = await request.get('/api/v1/my/contribution-status').expect(200)

      expect(response.body).not.toHaveProperty('action_limit')
      expect(response.body).toMatchObject({
        admission: { allowed: false, reason: 'global_limit' },
      })
    } finally {
      restore()
    }
  })

  it('rejects invalid contribution limit actions', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request.get('/api/v1/my/contribution-status?action=invalid').expect(400)
  })

  it('does not expose authored aggregate or safety policy through the status boundary', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    await request.get('/api/v1/my/contribution-status?action=authored_post').expect(400)
    await request.get('/api/v1/my/contribution-status?action=safety').expect(400)
    const response = await request.get('/api/v1/my/contribution-status?action=review').expect(200)
    expect(JSON.stringify(response.body)).not.toContain('authored_post')
    expect(JSON.stringify(response.body)).not.toContain('safety')
  })
})

async function recordAdmission(user: PrivateUser, source: 'discussion' | 'review'): Promise<void> {
  await expect(
    runContributionAdmission({
      actorId: user.id,
      idempotencyKey: crypto.randomUUID(),
      intent: { request: crypto.randomUUID() },
      source,
      policy: resolveContributionPolicy(
        getContributionPolicyConfigSnapshot(),
        createContributionPolicyActor(user.id, null),
        source,
      ),
      execute: async () => ({ post: { id: crypto.randomUUID() } }),
    }),
  ).resolves.toMatchObject({ kind: 'created' })
}
