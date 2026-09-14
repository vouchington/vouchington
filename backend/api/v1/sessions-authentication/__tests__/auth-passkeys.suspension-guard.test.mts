import { describe, expect, it, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  suspendTestUser,
  unsuspendTestUser,
  safeUsername,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'

describe('auth-passkeys.suspension-guard', () => {
  let users: PrivateUser[]

  beforeAll(async () => {
    users = (await Promise.all([
      createTestUser({ username: safeUsername('susp-pk-regopts') }),
      createTestUser({ username: safeUsername('susp-pk-regverify') }),
      createTestUser({ username: safeUsername('susp-pk-rename') }),
      createTestUser({ username: safeUsername('susp-pk-del') }),
    ])) as PrivateUser[]
  })

  describe('suspension guard on passkey routes', () => {
    it('suspended user gets 403 on POST /api/v1/auth/passkeys/registration/options', async () => {
      await suspendTestUser(users[0].id)

      const request = createRequest()
      await request.authenticateAs(users[0])

      const response = await request.post('/api/v1/auth/passkeys/registration/options').expect(403)

      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)

      await unsuspendTestUser(users[0].id)
    })

    it('suspended user gets 403 on POST /api/v1/auth/passkeys/registration/verify', async () => {
      await suspendTestUser(users[1].id)

      const request = createRequest()
      await request.authenticateAs(users[1])

      const response = await request
        .post('/api/v1/auth/passkeys/registration/verify')
        .send({ response: {} })
        .expect(403)

      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)

      await unsuspendTestUser(users[1].id)
    })

    it('suspended user gets 403 on PATCH /api/v1/auth/passkeys/:id', async () => {
      await suspendTestUser(users[2].id)

      const request = createRequest()
      await request.authenticateAs(users[2])

      const response = await request
        .patch('/api/v1/auth/passkeys/some-passkey-id')
        .send({ name: 'My Passkey' })
        .expect(403)

      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)

      await unsuspendTestUser(users[2].id)
    })

    it('suspended user gets 403 on DELETE /api/v1/auth/passkeys/:id', async () => {
      await suspendTestUser(users[3].id)

      const request = createRequest()
      await request.authenticateAs(users[3])

      const response = await request.delete('/api/v1/auth/passkeys/some-passkey-id').expect(403)

      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)

      await unsuspendTestUser(users[3].id)
    })
  })
})
