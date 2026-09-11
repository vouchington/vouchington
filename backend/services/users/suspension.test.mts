import { describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  safeUsername,
  suspendTestUser,
  suspendTestUserGetId,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import {
  suspendUser,
  unsuspendUser,
  assertNotSuspended,
  getUserSuspensionById,
} from './suspension.mts'
import { getPrivateUserByAny } from './get.mts'
import { ACCOUNT_SUSPENDED, CONFLICT } from '@modules/on-error/error-codes'
import * as psqlEnqueues from '@queues/psql/enqueues'

describe('suspendUser', () => {
  it('sets suspended_at, suspended_reason, and suspended_by_id', async () => {
    const refreshTopHashtags = vi.spyOn(psqlEnqueues, 'enqueueRefreshTopHashtags')
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser({ username: safeUsername('suspend-set') })
    refreshTopHashtags.mockClear()

    const result = await suspendUser(admin, user.id, 'spamming')

    expect(result.suspended_at).toBeTruthy()
    expect(result.suspended_reason).toBe('spamming')
    expect(result.suspended_by_id).toBe(admin.id)
    expect(refreshTopHashtags).toHaveBeenCalledOnce()
  })

  it('works without a reason', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser({ username: safeUsername('suspend-noreason') })

    const result = await suspendUser(admin, user.id)

    expect(result.suspended_at).toBeTruthy()
    expect(result.suspended_reason).toBeNull()
  })

  it('returns 403 for non-admin', async () => {
    const nonAdmin = await createTestUser({ username: safeUsername('suspend-nonadmin') })
    const target = await createTestUser({ username: safeUsername('suspend-target') })

    await expect(suspendUser(nonAdmin, target.id)).rejects.toMatchObject({ status: 403 })
  })

  it('returns 403 for null user', async () => {
    const target = await createTestUser({ username: safeUsername('suspend-null') })

    await expect(suspendUser(null, target.id)).rejects.toMatchObject({ status: 403 })
  })

  it('returns 404 for missing user', async () => {
    const admin = await createTestUser({ administrator: true })

    await expect(suspendUser(admin, '00000000-0000-7000-0000-000000000001')).rejects.toMatchObject({
      status: 404,
    })
  })

  it('returns 409 for already-suspended user', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser({ username: safeUsername('suspend-already') })
    await suspendTestUser(user.id)

    const err = await suspendUser(admin, user.id).catch(e => e)
    expect(err.status).toBe(409)
    expect(err.code).toBe(CONFLICT)
  })
})

describe('unsuspendUser', () => {
  it('lifts the active suspension so suspended_at is null', async () => {
    const refreshTopHashtags = vi.spyOn(psqlEnqueues, 'enqueueRefreshTopHashtags')
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser({ username: safeUsername('unsuspend-clear') })
    await suspendTestUser(user.id, 'test reason')
    refreshTopHashtags.mockClear()

    const result = await unsuspendUser(admin, user.id)

    expect(result.suspended_at).toBeNull()
    expect(result.suspended_reason).toBeNull()
    expect(result.suspended_by_id).toBeNull()
    expect(refreshTopHashtags).toHaveBeenCalledOnce()
  })

  it('returns 403 for non-admin', async () => {
    const nonAdmin = await createTestUser({ username: safeUsername('unsuspend-nonadmin') })
    const target = await createTestUser({ username: safeUsername('unsuspend-target') })
    await suspendTestUser(target.id)

    await expect(unsuspendUser(nonAdmin, target.id)).rejects.toMatchObject({ status: 403 })
  })

  it('returns 409 for non-suspended user', async () => {
    const admin = await createTestUser({ administrator: true })
    const user = await createTestUser({ username: safeUsername('unsuspend-notsuspended') })

    const err = await unsuspendUser(admin, user.id).catch(e => e)
    expect(err.status).toBe(409)
    expect(err.code).toBe(CONFLICT)
  })
})

describe('assertNotSuspended', () => {
  it('throws with ACCOUNT_SUSPENDED code for suspended user', async () => {
    const user = await createTestUser({ username: safeUsername('assert-suspended') })
    await suspendTestUser(user.id)

    const freshUser = await getPrivateUserByAny(user.id)

    let caughtError: { status: number; code: string } | undefined
    try {
      assertNotSuspended(freshUser)
    } catch (e) {
      caughtError = e as { status: number; code: string }
    }

    expect(caughtError).toBeDefined()
    expect(caughtError?.status).toBe(403)
    expect(caughtError?.code).toBe(ACCOUNT_SUSPENDED)

    await unsuspendTestUser(user.id)
  })

  it('does not throw for non-suspended user', async () => {
    const user = await createTestUser({ username: safeUsername('assert-notsuspended') })
    const freshUser = await getPrivateUserByAny(user.id)
    expect(() => assertNotSuspended(freshUser)).not.toThrow()
  })

  it('does not throw for null user', () => {
    expect(() => assertNotSuspended(null)).not.toThrow()
  })

  it('does not throw for undefined user', () => {
    expect(() => assertNotSuspended(undefined)).not.toThrow()
  })
})

describe('getUserSuspensionById', () => {
  it('returns the suspension record when it exists', async () => {
    const user = await createTestUser({ username: safeUsername('susp-by-id') })
    const suspensionId = await suspendTestUserGetId(user.id, 'by-id reason')

    const result = await getUserSuspensionById(suspensionId)

    expect(result).toBeDefined()
    expect(result?.id).toBe(suspensionId)
    expect(result?.user_id).toBe(user.id)
    expect(result?.reason).toBe('by-id reason')
    expect(result?.lifted_at).toBeNull()
  })

  it('returns undefined when suspension does not exist', async () => {
    const result = await getUserSuspensionById('00000000-0000-7000-0000-000000000001')

    expect(result).toBeUndefined()
  })
})
