import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown } from '../index.mts'
import {
  attemptTestMembershipGrantMutation,
  attemptTestMembershipOperationTransition,
  attemptTestRefundMembershipOperationTransition,
  claimTestMembershipOperation,
  createTestImmutableLineageBinding,
  createTestImmutableMembershipChange,
  createTestImmutableMembershipGrant,
  createTestImmutableMembershipOperation,
  createTestRefundMembershipOperation,
  deleteTestMembershipChange,
  mutateTestMembershipChange,
  setTestLineageBindingOriginatingInvoice,
} from '../../../test-helpers/data-stores/psql/membership-ledger-immutability.mts'

describe('membership ledger immutability', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('freezes grant facts and permits one revocation transition', async () => {
    const grantId = await createTestImmutableMembershipGrant()
    await expect(attemptTestMembershipGrantMutation(grantId, 'changeCalendarDays')).rejects.toThrow(
      'membership grants only allow a pending-to-revoked lifecycle transition',
    )
    await expect(attemptTestMembershipGrantMutation(grantId, 'delete')).rejects.toThrow(
      'membership grants cannot be deleted',
    )
    await expect(attemptTestMembershipGrantMutation(grantId, 'revoke')).resolves.toMatchObject({
      rowCount: 1,
    })
    await expect(attemptTestMembershipGrantMutation(grantId, 'rewriteReason')).rejects.toThrow(
      'membership grants only allow a pending-to-revoked lifecycle transition',
    )
    await expect(attemptTestMembershipGrantMutation(grantId, 'rewriteRevoker')).rejects.toThrow(
      'membership grants only allow a pending-to-revoked lifecycle transition',
    )
  })

  it('freezes operation facts and permits one terminal transition', async () => {
    await expect(
      createTestImmutableMembershipOperation(`invalid-collision-${randomUUID()}`, new Date()),
    ).rejects.toMatchObject({ code: '23514' })
    const operationId = await createTestImmutableMembershipOperation(`complete-${randomUUID()}`)
    await expect(
      attemptTestMembershipOperationTransition(operationId, 'changeIdempotencyKey'),
    ).rejects.toThrow('membership operations only allow one terminal lifecycle transition')
    await expect(
      attemptTestMembershipOperationTransition(operationId, 'changeBinding'),
    ).rejects.toThrow('membership operations only allow one terminal lifecycle transition')
    await expect(attemptTestMembershipOperationTransition(operationId, 'delete')).rejects.toThrow(
      'membership operations cannot be deleted',
    )
    await claimTestMembershipOperation(operationId)
    await expect(
      attemptTestMembershipOperationTransition(operationId, 'complete'),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      attemptTestMembershipOperationTransition(operationId, 'resetCompletion'),
    ).rejects.toThrow('membership operations only allow one terminal lifecycle transition')
    const failedOperationId = await createTestImmutableMembershipOperation(`failed-${randomUUID()}`)
    await claimTestMembershipOperation(failedOperationId)
    await expect(
      attemptTestMembershipOperationTransition(failedOperationId, 'failWithoutMessage'),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      attemptTestMembershipOperationTransition(failedOperationId, 'failWithMessage'),
    ).resolves.toMatchObject({ rowCount: 1 })
  })

  it('permits only claimed provider execution and reconciliation transitions', async () => {
    const operationId = await createTestRefundMembershipOperation(`lease-${randomUUID()}`)
    const claimToken = randomUUID()
    await expect(
      attemptTestRefundMembershipOperationTransition(operationId, 'claimWithoutTimestamp'),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(claimTestMembershipOperation(operationId, claimToken)).resolves.toMatchObject({
      rowCount: 1,
    })
    await expect(
      attemptTestRefundMembershipOperationTransition(operationId, 'providerRefund'),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      attemptTestRefundMembershipOperationTransition(operationId, 'fail'),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      attemptTestRefundMembershipOperationTransition(operationId, 'remainingRefundable'),
    ).resolves.toMatchObject({ rowCount: 1 })
  })

  it('scopes provider refund identities to their provider application context', async () => {
    const [firstOperationId, secondOperationId] = await Promise.all([
      createTestRefundMembershipOperation(`refund-context-first-${randomUUID()}`),
      createTestRefundMembershipOperation(`refund-context-second-${randomUUID()}`),
    ])
    const providerRefundId = `re_${randomUUID()}`
    await Promise.all(
      [firstOperationId, secondOperationId].map(operationId =>
        claimTestMembershipOperation(operationId),
      ),
    )
    await expect(
      Promise.all(
        [firstOperationId, secondOperationId].map(operationId =>
          attemptTestRefundMembershipOperationTransition(
            operationId,
            'providerRefund',
            providerRefundId,
          ),
        ),
      ),
    ).resolves.toHaveLength(2)
  })

  it('allows a lineage binding originating invoice to be filled once', async () => {
    const bindingId = await createTestImmutableLineageBinding()
    await expect(
      setTestLineageBindingOriginatingInvoice(bindingId, 'in_original'),
    ).resolves.toMatchObject({ rowCount: 1 })
    await expect(
      setTestLineageBindingOriginatingInvoice(bindingId, 'in_rewritten'),
    ).rejects.toThrow('membership lineage bindings only allow release and final-purge transitions')
  })

  it('rejects membership change history mutation and deletion', async () => {
    const changeId = await createTestImmutableMembershipChange()
    await expect(mutateTestMembershipChange(changeId)).rejects.toThrow(
      'membership changes are append-only',
    )
    await expect(deleteTestMembershipChange(changeId)).rejects.toThrow(
      'membership changes are append-only',
    )
  })
})
