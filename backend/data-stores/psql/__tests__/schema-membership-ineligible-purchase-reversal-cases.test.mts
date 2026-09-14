import { afterAll, describe, expect, it } from 'vitest'
import { onGracefulShutdown } from '../index.mts'
import { createLocalTestUser } from '../../../test-helpers/data-stores/psql/users.mts'
import {
  associateDuplicateTestReversalCaseOperation,
  associateUnknownTestReversalCaseOperation,
  associateWrongKindTestReversalCaseOperation,
  createTestReversalCaseFixture,
  createWrongKindTestReversalCaseOperation,
  deleteTestReversalCase,
  deleteTestReversalCaseOperation,
  insertTestReversalCase,
  mutateTestReversalCase,
  mutateTestReversalCaseOperation,
} from '../../../test-helpers/data-stores/psql/membership-reversal-cases.mts'

describe('membership ineligible purchase reversal case schema', () => {
  afterAll(async () => {
    await onGracefulShutdown()
  })

  it('makes collision cases and their operation associations immutable', async () => {
    const fixture = await createReversalCaseFixture()

    await expect(mutateTestReversalCase(fixture.caseId)).rejects.toThrow(
      'membership ineligible purchase reversal cases are immutable',
    )
    await expect(deleteTestReversalCase(fixture.caseId)).rejects.toThrow(
      'membership ineligible purchase reversal cases are immutable',
    )
    await expect(mutateTestReversalCaseOperation(fixture.caseId)).rejects.toThrow(
      'membership ineligible purchase reversal case operations are immutable',
    )
    await expect(deleteTestReversalCaseOperation(fixture.caseId)).rejects.toThrow(
      'membership ineligible purchase reversal case operations are immutable',
    )
  })

  it('keeps each binding and operation associated with at most one reversal case', async () => {
    const [first, second] = await Promise.all([
      createReversalCaseFixture(),
      createReversalCaseFixture(),
    ])

    await expect(
      insertTestReversalCase({
        ...first,
        refundCapMinorUnits: 50,
      }),
    ).rejects.toMatchObject({ code: '23505' })
    await expect(
      associateDuplicateTestReversalCaseOperation(second.caseId, first.operationId),
    ).rejects.toMatchObject({ code: '23514' })
    const wrongKindOperationId = await createWrongKindTestReversalCaseOperation(first.operationId)
    await expect(
      associateWrongKindTestReversalCaseOperation(first.caseId, wrongKindOperationId),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(associateUnknownTestReversalCaseOperation(second.caseId)).rejects.toMatchObject({
      code: '23503',
    })
  })

  it('enforces safe, qualifying-bounded refund caps', async () => {
    await expect(
      createReversalCaseFixture({ qualifyingAmountMinorUnits: 100, refundCapMinorUnits: 101 }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      createReversalCaseFixture({ qualifyingAmountMinorUnits: 100, refundCapMinorUnits: -1 }),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      createReversalCaseFixture({
        qualifyingAmountMinorUnits: 9_007_199_254_740_992,
        refundCapMinorUnits: 9_007_199_254_740_992,
      }),
    ).rejects.toMatchObject({ code: '23514' })
  })
})

async function createReversalCaseFixture(
  amounts = {
    qualifyingAmountMinorUnits: 100,
    refundCapMinorUnits: 75,
  },
): Promise<Awaited<ReturnType<typeof createTestReversalCaseFixture>>> {
  const user = await createLocalTestUser()
  return createTestReversalCaseFixture(user.id, amounts)
}
