import { createTransactionResource } from '../../../test-helpers/services/identity-verification/transaction-resource.mts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { beginTransaction } from '@voucha/test-helpers'
import { onVerificationSessionRequiresInput as onVerificationSessionRequiresInputProduction } from '../event-session-lifecycle.mts'
import {
  onCheckoutAbortedForIdentity as onCheckoutAbortedForIdentityProduction,
  onVerificationSessionCanceled as onVerificationSessionCanceledProduction,
} from '../event-session-terminal.mts'

const mockBeginTransaction = vi.fn<typeof beginTransaction>()
const mockInvalidateUsers = vi.fn<(userId: string) => Promise<void>>()

function onVerificationSessionRequiresInput(
  ...args: Parameters<typeof onVerificationSessionRequiresInputProduction>
) {
  const [eventId, eventData, dependencies] = args
  return onVerificationSessionRequiresInputProduction(eventId, eventData, {
    beginTransaction: mockBeginTransaction as never,
    invalidateUsers: mockInvalidateUsers as never,
    ...dependencies,
  })
}

function onVerificationSessionCanceled(
  ...args: Parameters<typeof onVerificationSessionCanceledProduction>
) {
  const [eventId, eventData, dependencies] = args
  return onVerificationSessionCanceledProduction(eventId, eventData, {
    beginTransaction: mockBeginTransaction as never,
    invalidateUsers: mockInvalidateUsers as never,
    ...dependencies,
  })
}

function onCheckoutAbortedForIdentity(
  ...args: Parameters<typeof onCheckoutAbortedForIdentityProduction>
) {
  const [eventId, eventData, dependencies] = args
  return onCheckoutAbortedForIdentityProduction(eventId, eventData, {
    beginTransaction: mockBeginTransaction as never,
    invalidateUsers: mockInvalidateUsers as never,
    ...dependencies,
  })
}

function makeQueryResult(rows: Record<string, unknown>[] = []) {
  return { rowCount: rows.length, rows, command: 'SELECT', oid: 0, fields: [] }
}

describe('onVerificationSessionRequiresInput', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBeginTransaction.mockImplementation(async () => {
      const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult([{ id: 'user-1' }]))
      return createTransactionResource(query as never)
    })
    mockInvalidateUsers.mockResolvedValue(undefined)
  })

  it('skips when sessionId is absent', async () => {
    await onVerificationSessionRequiresInput('evt_1', { metadata: { user_id: 'user-1' } })
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('invalidates user cache when session is identity_pending (user can retry on same session)', async () => {
    await onVerificationSessionRequiresInput('evt_1', {
      id: 'vs_test',
      metadata: { user_id: 'user-1' },
    })
    expect(mockBeginTransaction).toHaveBeenCalledTimes(1)
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
  })

  it('works without metadata.user_id (Stripe clears metadata on redacted sessions)', async () => {
    await onVerificationSessionRequiresInput('evt_1', {
      id: 'vs_test',
      metadata: {},
    })
    expect(mockBeginTransaction).toHaveBeenCalledTimes(1)
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
  })

  it('does not call invalidate when no rows are returned (session not found)', async () => {
    mockBeginTransaction.mockImplementation(async () => {
      const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult([]))
      return createTransactionResource(query as never)
    })
    await onVerificationSessionRequiresInput('evt_1', { id: 'vs_test' })
    expect(mockInvalidateUsers).not.toHaveBeenCalled()
  })
})

describe('onVerificationSessionCanceled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBeginTransaction.mockImplementation(async () => {
      const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult([{ id: 'user-1' }]))
      return createTransactionResource(query as never)
    })
    mockInvalidateUsers.mockResolvedValue(undefined)
  })

  it('skips when sessionId is absent', async () => {
    await onVerificationSessionCanceled('evt_1', { metadata: { user_id: 'user-1' } })
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('resets verification_status to unverified and invalidates via RETURNING rows', async () => {
    await onVerificationSessionCanceled('evt_1', {
      id: 'vs_test',
      metadata: { user_id: 'user-1' },
    })
    expect(mockBeginTransaction).toHaveBeenCalledTimes(1)
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
  })

  it('works without metadata.user_id (Stripe clears metadata on redacted sessions)', async () => {
    await onVerificationSessionCanceled('evt_1', {
      id: 'vs_test',
      metadata: {},
    })
    expect(mockBeginTransaction).toHaveBeenCalledTimes(1)
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
  })

  it('does not call invalidate when no rows are returned (session not found)', async () => {
    mockBeginTransaction.mockImplementation(async () => {
      const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult([]))
      return createTransactionResource(query as never)
    })
    await onVerificationSessionCanceled('evt_1', { id: 'vs_test' })
    expect(mockInvalidateUsers).not.toHaveBeenCalled()
  })
})

describe('onCheckoutAbortedForIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBeginTransaction.mockImplementation(async () => {
      const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult([{ id: 'user-1' }]))
      return createTransactionResource(query as never)
    })
    mockInvalidateUsers.mockResolvedValue(undefined)
  })

  it('skips when intent is not identity-verification', async () => {
    await onCheckoutAbortedForIdentity('evt_1', {
      id: 'cs_test',
      metadata: { intent: 'other', user_id: 'user-1' },
    })
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('skips when user_id is absent', async () => {
    await onCheckoutAbortedForIdentity('evt_1', {
      id: 'cs_test',
      metadata: { intent: 'identity-verification' },
    })
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('skips when checkout session id is absent', async () => {
    await onCheckoutAbortedForIdentity('evt_1', {
      metadata: { intent: 'identity-verification', user_id: 'user-1' },
    })
    expect(mockBeginTransaction).not.toHaveBeenCalled()
  })

  it('resets payment_pending to unverified and invalidates user', async () => {
    await onCheckoutAbortedForIdentity('evt_1', {
      id: 'cs_test',
      metadata: { intent: 'identity-verification', user_id: 'user-1' },
    })
    expect(mockBeginTransaction).toHaveBeenCalledTimes(1)
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
  })

  it('does not invalidate when no rows returned (session not matched)', async () => {
    mockBeginTransaction.mockImplementation(async () => {
      const query = vi.fn<VitestLooseMock>().mockResolvedValue(makeQueryResult([]))
      return createTransactionResource(query as never)
    })
    await onCheckoutAbortedForIdentity('evt_1', {
      id: 'cs_test',
      metadata: { intent: 'identity-verification', user_id: 'user-1' },
    })
    expect(mockInvalidateUsers).not.toHaveBeenCalled()
  })

  it('rolls back the terminal state change when attempt release fails, so replay can recover', async () => {
    const releaseFailure = new Error('attempt release failed')
    mockBeginTransaction.mockImplementationOnce(async () => {
      const query = vi.fn<VitestLooseMock>().mockRejectedValue(releaseFailure)
      return createTransactionResource(query as never)
    })

    await expect(
      onCheckoutAbortedForIdentity('evt_1', {
        id: 'cs_test',
        metadata: { intent: 'identity-verification', user_id: 'user-1' },
      }),
    ).rejects.toThrow('attempt release failed')
    expect(mockInvalidateUsers).not.toHaveBeenCalled()

    await onCheckoutAbortedForIdentity('evt_2', {
      id: 'cs_test',
      metadata: { intent: 'identity-verification', user_id: 'user-1' },
    })
    expect(mockBeginTransaction).toHaveBeenCalledTimes(2)
    expect(mockInvalidateUsers).toHaveBeenCalledWith('user-1')
  })
})
