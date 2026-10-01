import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestPost, insertTestVoteIntegrityFlag } from '@voucha/test-helpers'
import { registerStaffRequestContractTests } from '../../../test-helpers/staff-request-contract-matrix.mts'
import type { PrivateUser } from '@services/users/types'

const ID = randomUUID()
const BASE = '/api/v1/vote-integrity'

describe('vote-integrity request contracts', () => {
  registerStaffRequestContractTests([
    ['flag id', 'get', `${BASE}/flags/not-a-uuid`],
    ['penalty id', 'get', `${BASE}/penalties/not-a-uuid`],
    ['penalty revoke id', 'delete', `${BASE}/penalties/not-a-uuid`],
    ['penalty apply id', 'post', `${BASE}/flags/not-a-uuid/penalties`],
    ['resolution missing', 'patch', `${BASE}/flags/${ID}`, {}],
    ['resolution type', 'patch', `${BASE}/flags/${ID}`, { resolution: 5 }],
    ['resolution unknown key', 'patch', `${BASE}/flags/${ID}`, { resolution: 'dismissed', x: 1 }],
    ['resolution flag id', 'patch', `${BASE}/flags/not-a-uuid`, { resolution: 'dismissed' }],
  ])

  describe('side effects', () => {
    let admin: PrivateUser

    beforeAll(async () => {
      admin = await createTestUser({ administrator: true })
    })

    it('leaves the flag unresolved for a malformed body and then resolves it for a valid one', async () => {
      const postId = await insertTestPost({
        title: 'Vote integrity contract',
        slug: `vi-${randomUUID().slice(0, 8)}`,
        createdById: admin.id,
        markdown: 'test',
      })
      const flagId = await insertTestVoteIntegrityFlag({ postId })
      const request = createRequest()
      await request.authenticateAs(admin)
      const url = `${BASE}/flags/${flagId}`

      await request.patch(url).send({ resolution: 5 }).expect(422)
      await request.patch(url).send({ resolution: 'dismissed', x: 1 }).expect(422)
      expect((await request.get(url).expect(200)).body.flag.resolved_at).toBeNull()

      const resolved = await request.patch(url).send({ resolution: 'dismissed' }).expect(200)
      expect(resolved.body.flag.resolution).toBe('dismissed')
    })

    it('answers 404 for unknown but well-formed ids', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)

      await request.get(`${BASE}/flags/${ID}`).expect(404)
      await request.get(`${BASE}/penalties/${ID}`).expect(404)
    })
  })
})
