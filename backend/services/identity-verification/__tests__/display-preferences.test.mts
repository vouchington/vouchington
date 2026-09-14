import { createTransactionResource } from '../../../test-helpers/services/identity-verification/transaction-resource.mts'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { beginTransaction } from '@voucha/test-helpers'
import { updateDisplayPreferences } from '../display-preferences.mts'

const mockBeginTransaction = vi.fn<typeof beginTransaction>()
const mockInvalidateUsers = vi.fn<(userId: string) => Promise<void>>()

function updateDisplayPreferencesForTest(...args: Parameters<typeof updateDisplayPreferences>) {
  const [userId, input, dependencies] = args
  return updateDisplayPreferences(userId, input, {
    beginTransaction: mockBeginTransaction as never,
    invalidateUsers: mockInvalidateUsers as never,
    ...dependencies,
  })
}

function makeQueryFn(rowCount = 1) {
  const q = vi.fn<VitestLooseMock>().mockResolvedValue({ rowCount })
  ;(q as unknown as { client: unknown }).client = {}
  return q as never
}

function setupTransactionMock(rowCount = 1) {
  mockBeginTransaction.mockImplementation(async () =>
    createTransactionResource(makeQueryFn(rowCount)),
  )
}

describe('updateDisplayPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupTransactionMock()
    mockInvalidateUsers.mockResolvedValue(undefined)
  })

  it('does nothing when no fields are provided', async () => {
    await updateDisplayPreferencesForTest('user-1', {})
    expect(mockBeginTransaction).not.toHaveBeenCalled()
    expect(mockInvalidateUsers).not.toHaveBeenCalled()
  })

  it('updates verified_badge_visible only', async () => {
    await updateDisplayPreferencesForTest('user-1', { verified_badge_visible: false })
    expect(mockBeginTransaction).toHaveBeenCalledTimes(1)
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
  })

  it('updates public_verified_name_display only', async () => {
    await updateDisplayPreferencesForTest('user-1', { public_verified_name_display: 'first_name' })
    expect(mockBeginTransaction).toHaveBeenCalledTimes(1)
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
  })

  it('updates both fields at once', async () => {
    await updateDisplayPreferencesForTest('user-1', {
      verified_badge_visible: true,
      public_verified_name_display: 'full_name',
    })
    expect(mockBeginTransaction).toHaveBeenCalledTimes(1)
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
  })

  it('accepts all valid public_verified_name_display values', async () => {
    const values = ['hidden', 'first_name', 'first_name_last_initial', 'full_name'] as const
    for (const value of values) {
      vi.clearAllMocks()
      setupTransactionMock()
      mockInvalidateUsers.mockResolvedValue(undefined)
      await updateDisplayPreferencesForTest('user-1', { public_verified_name_display: value })
      expect(mockBeginTransaction).toHaveBeenCalledTimes(1)
    }
  })

  it('does not invalidate cache when UPDATE matches 0 rows (user is not verified)', async () => {
    setupTransactionMock(0)
    await updateDisplayPreferencesForTest('user-1', { verified_badge_visible: true })
    expect(mockBeginTransaction).toHaveBeenCalledTimes(1)
    expect(mockInvalidateUsers).not.toHaveBeenCalled()
  })
})
