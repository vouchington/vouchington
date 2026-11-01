import type { Context } from '@jongleberry/api-server'
import * as onErrorModule from '@modules/on-error'
import { createTestMembership, createTestUser } from '@voucha/test-helpers'
import { rejectPostgresReadForTest } from '@voucha/test-helpers/injected-failures'
import { describe, expect, it, vi } from 'vitest'
import { meterRestUsage } from './rest-usage-meter.mts'
import * as usageMeterHelpers from './usage-meter-helpers.mts'

// Session routes settle a plan and return before the quota check.
const ROUTE_KEY = 'GET:/api/v1/session'

function request(currentUser?: { id: string; membership_plan: 'plus' | 'pro' | null } | null) {
  return { currentUser } as Context
}

async function settledPlan(ctx: Context, userId: string) {
  const settle = vi.spyOn(usageMeterHelpers, 'settleUsageOnClose').mockImplementation(() => {})
  try {
    await meterRestUsage(ctx, ROUTE_KEY, userId)
    return settle.mock.calls[0]?.[1].plan
  } finally {
    settle.mockRestore()
  }
}

describe('meterRestUsage session plan', () => {
  it('reuses the user the route already loaded without reading it again', async () => {
    await expect(
      settledPlan(request({ id: 'user-1', membership_plan: 'plus' }), 'user-1'),
    ).resolves.toBe('plus')
  })

  it('reads the user by id when the route loaded none or loaded someone else', async () => {
    const user = await createTestUser()
    await createTestMembership({ user_id: user.id, plan: 'pro' })

    await expect(settledPlan(request(undefined), user.id)).resolves.toBe('pro')
    await expect(settledPlan(request(null), user.id)).resolves.toBe('pro')
    await expect(
      settledPlan(request({ id: 'user-2', membership_plan: 'plus' }), user.id),
    ).resolves.toBe('pro')
  })

  it('is the free plan for a user with no membership or no record', async () => {
    const user = await createTestUser()
    const reportError = vi.spyOn(onErrorModule, 'default')
    try {
      await expect(settledPlan(request(undefined), user.id)).resolves.toBe('free')
      await expect(settledPlan(request(undefined), crypto.randomUUID())).resolves.toBe('free')
      expect(reportError).not.toHaveBeenCalled()
    } finally {
      reportError.mockRestore()
    }
  })

  it('fails open to the free plan and reports a failed read', async () => {
    const failure = new Error('read replica unavailable')
    const restoreRead = rejectPostgresReadForTest('getPrivateUserByAny', failure)
    const reportError = vi.spyOn(onErrorModule, 'default').mockReturnValue(undefined)
    try {
      await expect(settledPlan(request(undefined), crypto.randomUUID())).resolves.toBe('free')
      expect(reportError).toHaveBeenCalledExactlyOnceWith(failure)
    } finally {
      restoreRead()
      reportError.mockRestore()
    }
  })
})
