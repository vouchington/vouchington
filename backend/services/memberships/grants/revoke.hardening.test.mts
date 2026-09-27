import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  runTestActionAfterMembershipUserLock,
  withTestMembershipUserLocked,
} from '@voucha/test-helpers'

describe('membership lock-wait helpers', () => {
  it('rethrows an immediately rejected lifecycle action after releasing its holder', async () => {
    const user = await createTestUser()
    const failure = new Error('lifecycle action failed')

    await expect(
      runTestActionAfterMembershipUserLock(user.id, () => Promise.reject(failure)),
    ).rejects.toBe(failure)
    await expect(
      withTestMembershipUserLocked(user.id, async () => undefined),
    ).resolves.toBeUndefined()
  })

  it('rethrows a synchronous lifecycle action failure after releasing its holder', async () => {
    const user = await createTestUser()
    const failure = new Error('lifecycle action threw')

    await expect(
      runTestActionAfterMembershipUserLock(user.id, () => {
        throw failure
      }),
    ).rejects.toBe(failure)
    await expect(
      withTestMembershipUserLocked(user.id, async () => undefined),
    ).resolves.toBeUndefined()
  })

  it('retains the early-completion diagnostic for a successful lifecycle action', async () => {
    const user = await createTestUser()

    await expect(
      runTestActionAfterMembershipUserLock(user.id, async () => undefined),
    ).rejects.toThrow('Membership action completed before waiting for the recipient lock')
    await expect(
      withTestMembershipUserLocked(user.id, async () => undefined),
    ).resolves.toBeUndefined()
  })
})
