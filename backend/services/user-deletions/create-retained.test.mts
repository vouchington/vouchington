import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  countUserDeletionAuditLogsForTest,
  createTestUser,
  insertTestUserDeletionAudit,
  lockTestUserRowForUpdate,
} from '@voucha/test-helpers'
import { createUserDeletionRequest } from './create.mts'

describe('retained user deletion requests', () => {
  it('rejects a request for a user that never existed', async () => {
    const requester = await createTestUser()
    await expect(createUserDeletionRequest(randomUUID(), requester.id)).rejects.toThrow(
      'User is already deleted',
    )
  })

  it('rejects a requester that never existed', async () => {
    const target = await createTestUser()
    await expect(createUserDeletionRequest(target.id, randomUUID())).rejects.toThrow(
      'Requesting user does not exist',
    )
  })

  it('accepts uppercase UUID spelling for real target and requester', async () => {
    const target = await createTestUser()
    const requester = await createTestUser()
    const request = await createUserDeletionRequest(
      target.id.toUpperCase(),
      requester.id.toUpperCase(),
    )
    expect(request.userId).toBe(target.id)
    expect(request.requestedById).toBe(requester.id)
  })

  it('records reciprocal requests and audits while each distinct live target is locked', async () => {
    const first = await createTestUser()
    const second = await createTestUser()
    await using firstQuery = await beginTransaction()
    await using secondQuery = await beginTransaction()
    await lockTestUserRowForUpdate(firstQuery, first.id)
    await lockTestUserRowForUpdate(secondQuery, second.id)

    const requests = await Promise.all([
      createUserDeletionRequest(first.id, second.id, { query: firstQuery }),
      createUserDeletionRequest(second.id, first.id, { query: secondQuery }),
    ])
    await Promise.all([
      insertTestUserDeletionAudit(first.id, second.id, firstQuery),
      insertTestUserDeletionAudit(second.id, first.id, secondQuery),
    ])
    await firstQuery.commit()
    await secondQuery.commit()

    expect(requests.map(request => request.userId).toSorted()).toEqual(
      [first.id, second.id].toSorted(),
    )
    expect(await countUserDeletionAuditLogsForTest(first.id)).toBe(1)
    expect(await countUserDeletionAuditLogsForTest(second.id)).toBe(1)
  })
})
