import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserWithAge,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { getHostnameElectionVote } from '@services/elections-votes/hostname'
import type { PrivateUser } from '@services/users/types'

// Every route that reaches createVoteHandler/createVoteClearHandler, plus the three routes that list
// votes by election id. Path shape and body shape are checked only after authentication and any
// role check, so a denied caller never sees a validation diagnostic.
const voteWrites = [
  { name: 'agent moderation', path: 'agent-moderations' },
  { name: 'entity relation', path: 'entity-relations' },
  { name: 'hostname', path: 'hostnames' },
  { name: 'user vouch', path: 'users', suffix: 'vouch-vote' },
] as const

const voteLists = [
  { name: 'agent moderation', path: 'agent-moderations' },
  { name: 'entity relation', path: 'entity-relations' },
  { name: 'hostname', path: 'hostnames' },
] as const

const adminOnly = [{ path: 'agent-moderations' }] as const

const malformedId = 'not-a-uuid'
const missingId = '00000000-0000-4000-8000-000000000000'
const methods = ['put', 'delete'] as const

function votePath(entry: { path: string; suffix?: string }, id: string): string {
  return `/api/v1/${entry.path}/${id}/${entry.suffix ?? 'vote'}`
}

function voteBody(method: (typeof methods)[number]): { choice: string } | undefined {
  return method === 'put' ? { choice: 'vouch' } : undefined
}

describe('vote route request contract validation', () => {
  let admin: PrivateUser
  let user: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  }, 60_000)

  describe.each(voteWrites)('$name vote writes', entry => {
    it.each(methods)(
      '%s returns 401 without a validation diagnostic for an anonymous malformed id',
      async method => {
        const request = createRequest()
        const response = await request[method](votePath(entry, malformedId))
          .send(voteBody(method))
          .expect(401)
        expect(response.body.message).not.toMatch(/invalid/i)
      },
    )

    it.each(methods)('%s returns 422 for a malformed id', async method => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request[method](votePath(entry, malformedId)).send(voteBody(method)).expect(422)
    })
  })

  describe.each(adminOnly)('$path admin-only writes and listing', entry => {
    it.each(methods)(
      '%s returns 403 without a diagnostic for a non-admin with a malformed id',
      async method => {
        const request = createRequest()
        await request.authenticateAs(user)
        const response = await request[method](votePath(entry, malformedId))
          .send(voteBody(method))
          .expect(403)
        expect(response.body.message).not.toMatch(/invalid/i)
      },
    )

    it('returns 403 without a diagnostic when a non-admin lists votes for a malformed id', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request.get(`/api/v1/${entry.path}/${malformedId}/votes`).expect(403)
      expect(response.body.message).not.toMatch(/invalid/i)
    })
  })

  describe.each(voteLists)('$name vote listing', entry => {
    it('returns 401 without a validation diagnostic for an anonymous malformed id', async () => {
      const response = await createRequest()
        .get(`/api/v1/${entry.path}/${malformedId}/votes`)
        .expect(401)
      expect(response.body.message).not.toMatch(/invalid/i)
    })

    it('returns 422 for a malformed id', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get(`/api/v1/${entry.path}/${malformedId}/votes`).expect(422)
    })

    it('keeps the pagination parser 400 for a malformed limit', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get(`/api/v1/${entry.path}/${missingId}/votes?limit=abc`).expect(400)
    })
  })

  it('rejects an unknown vote body field before recording a hostname ballot', async () => {
    const hostnameId = await insertTestUrlHostname({
      hostname: `vote-unknown-field-${crypto.randomUUID().slice(0, 8)}.example.com`,
    })
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .put(`/api/v1/hostnames/${hostnameId}/vote`)
      .send({ choice: 'vouch', extra: true })
      .expect(422)
    await expect(getHostnameElectionVote(user.id, hostnameId)).resolves.toBeNull()
  })
})
