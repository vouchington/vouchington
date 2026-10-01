import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import {
  deletePreservationHoldForTest,
  insertPreservationHoldForTest,
  releasePreservationHoldForTest,
  reopenPreservationHoldForTest,
  replacePreservationHoldCiphertextForTest,
  stampPreservationHoldReleasedAtOnlyForTest,
} from '../../../test-helpers/entities/user-legal-preservation-holds.mts'
import { createTestUser } from '../../../test-helpers/entities/users.mts'
import { onGracefulShutdown } from '../index.mts'

const FROZEN = 'legal preservation holds change only by a single release'
const RETAINED = 'legal preservation holds are retained'

describe('user_legal_preservation_holds schema', () => {
  afterAll(onGracefulShutdown)

  it('allows one open hold per account and a new hold after release', async () => {
    const [admin, account] = await Promise.all([createTestUser(), createTestUser()])
    const holdId = await insertPreservationHoldForTest(account.id, admin.id)

    await expect(insertPreservationHoldForTest(account.id, admin.id)).rejects.toMatchObject({
      code: '23505',
    })
    await releasePreservationHoldForTest(holdId, admin.id)

    await expect(insertPreservationHoldForTest(account.id, admin.id)).resolves.toEqual(
      expect.any(String),
    )
  })

  it('never deletes a hold and freezes everything except one release', async () => {
    const [admin, account] = await Promise.all([createTestUser(), createTestUser()])
    const holdId = await insertPreservationHoldForTest(account.id, admin.id)

    await expect(deletePreservationHoldForTest(holdId)).rejects.toThrow(RETAINED)
    await expect(replacePreservationHoldCiphertextForTest(holdId, 'other')).rejects.toThrow(FROZEN)
    await releasePreservationHoldForTest(holdId, admin.id)
    await expect(reopenPreservationHoldForTest(holdId)).rejects.toThrow(FROZEN)
    await expect(deletePreservationHoldForTest(holdId)).rejects.toThrow(RETAINED)
  })

  it('requires released_at and released_by_id together and a non-empty reference', async () => {
    const [admin, account] = await Promise.all([createTestUser(), createTestUser()])
    const holdId = await insertPreservationHoldForTest(account.id, admin.id)

    await expect(stampPreservationHoldReleasedAtOnlyForTest(holdId)).rejects.toMatchObject({
      code: '23514',
    })
    await expect(insertPreservationHoldForTest(account.id, admin.id, '')).rejects.toMatchObject({
      code: '23514',
    })
  })

  it('rejects a hold that names an unknown account or administrator', async () => {
    const admin = await createTestUser()

    await expect(insertPreservationHoldForTest(randomUUID(), admin.id)).rejects.toMatchObject({
      code: '23503',
    })
    await expect(insertPreservationHoldForTest(admin.id, randomUUID())).rejects.toMatchObject({
      code: '23503',
    })
  })
})
