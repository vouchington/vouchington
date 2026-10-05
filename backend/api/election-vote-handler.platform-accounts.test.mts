import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import {
  createAccountTypeTestAgent,
  createAccountTypeTestUser,
} from '@voucha/test-helpers/account-types'
import { getPrivateUserByAny } from '@services/users'
import { OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN } from '@modules/on-error/error-codes'

// The administrator-role case lives in election-vote-handler.test.mts. These cover the other
// derived account types: the guard keys on `account_type != null`, not on the administrator role.
describe('election-vote-handler platform accounts (via PUT /api/v1/topics/:id/vote)', () => {
  let topicId: string

  beforeAll(async () => {
    const creator = await createTestUser({ administrator: true })
    const slug = `platform-vote-${crypto.randomUUID().slice(0, 8)}`
    topicId = await insertTestTopic({ name: slug, slug, createdById: creator.id })
  }, 60_000)

  it.each(['official', 'system', 'ai_agent'] as const)(
    'returns 403 with OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN for a %s account',
    async kind => {
      const account = await createAccountTypeTestUser(kind === 'official' ? 'official' : 'system')
      if (kind === 'ai_agent') await createAccountTypeTestAgent(account.id, false, true)
      expect((await getPrivateUserByAny(account.id))?.account_type).toBe(kind)
      const request = createRequest()
      await request.authenticateAs(account)

      const response = await request
        .put(`/api/v1/topics/${topicId}/vote`)
        .send({ choice: 'like' })
        .expect(403)

      expect(response.body.code).toBe(OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN)
      expect(response.body.message).toBe(
        'Official and automated accounts cannot create community trust signals.',
      )
    },
    60_000,
  )
})
