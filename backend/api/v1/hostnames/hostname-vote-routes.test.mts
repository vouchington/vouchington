import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserWithAge,
  insertTestUrlHostname,
  updateUrlHostnameBlocked,
} from '@voucha/test-helpers'
import { getHostnameElectionVote } from '@services/elections-votes/hostname'
import { caches } from '@services/entity-cache/caches'

describe('hostname vote routes', () => {
  it('casts and retracts a semantic hostname ballot to Neutral', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const hostnameId = await insertTestUrlHostname({
      hostname: `semantic-vote-${crypto.randomUUID().slice(0, 8)}.example.com`,
    })
    const request = createRequest()
    await request.authenticateAs(user)

    await request.put(`/api/v1/hostnames/${hostnameId}/vote`).send({ choice: 'vouch' }).expect(204)
    await expect(getHostnameElectionVote(user.id, hostnameId)).resolves.toMatchObject({
      choice: 'vouch',
    })

    await request
      .put(`/api/v1/hostnames/${hostnameId}/vote`)
      .send({ choice: 'neutral' })
      .expect(204)
    await expect(getHostnameElectionVote(user.id, hostnameId)).resolves.toMatchObject({
      choice: 'neutral',
    })
  })

  it('hides blocked hostnames from non-moderator PUT while preserving a historical Clear', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const noBallotUser = await createTestUser()
    const hostnameId = await insertTestUrlHostname({
      hostname: `blocked-vote-${crypto.randomUUID().slice(0, 8)}.example.com`,
    })
    const request = createRequest()
    await request.authenticateAs(user)
    await request.put(`/api/v1/hostnames/${hostnameId}/vote`).send({ choice: 'vouch' }).expect(204)
    await updateUrlHostnameBlocked(hostnameId, true)
    await caches.url_hostnames.invalidateCacheGetByAny(hostnameId)

    await request
      .put(`/api/v1/hostnames/${hostnameId}/vote`)
      .send({ choice: 'disavow' })
      .expect(404)
    await request.delete(`/api/v1/hostnames/${hostnameId}/vote`).expect(204)
    await request
      .put(`/api/v1/hostnames/${hostnameId}/vote`)
      .send({ choice: 'neutral' })
      .expect(404)
    await expect(getHostnameElectionVote(user.id, hostnameId)).resolves.toBeNull()
    await request.authenticateAs(noBallotUser)
    await request.delete(`/api/v1/hostnames/${hostnameId}/vote`).expect(404)
  })
})
