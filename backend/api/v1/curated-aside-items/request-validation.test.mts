import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { registerStaffRequestContractTests } from '../../../test-helpers/staff-request-contract-matrix.mts'
import type { PrivateUser } from '@services/users/types'

const ID = randomUUID()
const BASE = '/api/v1/curated-aside-items'

describe('curated-aside-items request contracts', () => {
  registerStaffRequestContractTests([
    ['create empty', 'post', BASE, {}],
    ['create aside_type missing', 'post', BASE, { entity_id: ID }],
    ['create entity_id missing', 'post', BASE, { aside_type: 'topic' }],
    ['create aside_type type', 'post', BASE, { aside_type: 5, entity_id: ID }],
    ['create position type', 'post', BASE, { aside_type: 'topic', entity_id: ID, position: 'x' }],
    ['create unknown key', 'post', BASE, { aside_type: 'topic', entity_id: ID, extra: true }],
    ['order empty', 'put', `${BASE}/order`, {}],
    ['order item_ids type', 'put', `${BASE}/order`, { aside_type: 'topic', item_ids: 'x' }],
    ['order item_ids entries', 'put', `${BASE}/order`, { aside_type: 'topic', item_ids: [5] }],
    ['order unknown key', 'put', `${BASE}/order`, { aside_type: 'topic', item_ids: [], x: 1 }],
    ['delete id', 'delete', `${BASE}/not-a-uuid`],
  ])

  describe('behavior', () => {
    let admin: PrivateUser

    beforeAll(async () => {
      admin = await createTestUser({ administrator: true })
    })

    it('keeps the semantic statuses for well-typed bodies', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)

      await request.post(BASE).send({ aside_type: '  ', entity_id: ID }).expect(400)
      await request.post(BASE).send({ aside_type: 'nope', entity_id: ID }).expect(422)
      await request.post(BASE).send({ aside_type: 'topic', entity_id: ' ' }).expect(400)
      await request.post(BASE).send({ aside_type: 'topic', entity_id: 'x' }).expect(422)
      await request
        .post(BASE)
        .send({ aside_type: 'topic', entity_id: ID, position: 1.5 })
        .expect(422)
      await request.put(`${BASE}/order`).send({ aside_type: ' ', item_ids: [] }).expect(400)
      await request.put(`${BASE}/order`).send({ aside_type: 'nope', item_ids: [] }).expect(422)
      await request
        .put(`${BASE}/order`)
        .send({ aside_type: 'topic', item_ids: ['x'] })
        .expect(422)
      await request
        .put(`${BASE}/order`)
        .send({ aside_type: 'topic', item_ids: [ID, ID] })
        .expect(422)
    })

    it('reorders only after the body passes the contract', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const created: string[] = []
      for (const label of ['a', 'b']) {
        const slug = `curated-contract-${label}-${randomUUID().slice(0, 8)}`
        const community = await insertTestCommunity({ createdById: admin.id, name: slug, slug })
        const response = await request
          .post(BASE)
          .send({ aside_type: 'community', entity_id: community.id })
          .expect(201)
        created.push(response.body.curated_aside_item.id)
      }
      const [first, second] = created as [string, string]
      const order = async () =>
        (await request.get(`${BASE}?type=community`).expect(200)).body.curated_aside_items
          .map((item: { id: string }) => item.id)
          .filter((id: string) => created.includes(id))

      await request
        .put(`${BASE}/order`)
        .send({ aside_type: 'community', item_ids: [first, second] })
        .expect(204)
      expect(await order()).toEqual([first, second])

      await request.put(`${BASE}/order`).send({ aside_type: 'community', item_ids: 5 }).expect(422)
      expect(await order()).toEqual([first, second])

      await request
        .put(`${BASE}/order`)
        .send({ aside_type: 'community', item_ids: [second, first] })
        .expect(204)
      expect(await order()).toEqual([second, first])
    })
  })
})
