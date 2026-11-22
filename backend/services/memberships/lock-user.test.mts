import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import { lockMembershipUser } from './lock-user.mts'
import { InvalidMembershipGrantUserError } from './create-source.mts'

describe('membership user locks', () => {
  it('preserves missing-user storage failures for ordinary mutations', async () => {
    await expect(
      (async () => {
        await using query = await beginTransaction()
        await lockMembershipUser(randomUUID(), query)
      })(),
    ).rejects.toMatchObject({ code: 'P0002' })

    const user = await createTestUser()
    await using query = await beginTransaction()
    await expect(lockMembershipUser(user.id, query)).resolves.toBeUndefined()
  })

  it('maps a missing grant recipient to the public invalid-user error', async () => {
    await expect(
      (async () => {
        await using query = await beginTransaction()
        await lockMembershipUser(randomUUID(), query, true)
      })(),
    ).rejects.toBeInstanceOf(InvalidMembershipGrantUserError)
  })
})
