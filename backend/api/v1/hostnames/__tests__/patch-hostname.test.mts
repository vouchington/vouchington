import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUserDirect,
  getUrlHostnameUnreliableStatusCodesForTest,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'

describe('PATCH /api/v1/hostnames/:id', () => {
  let regularUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let adminUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let hostnameId: string | null = null

  beforeAll(async () => {
    regularUser = await createTestUserDirect()
    adminUser = await createTestUserDirect()
    await addUserRole(adminUser!.id, 'administrator')
    hostnameId = await insertTestUrlHostname({
      hostname: `patch-test-${Date.now()}.example.com`,
      blocked: false,
      crawlable: true,
    })
  })

  it('returns 401 when unauthenticated', async () => {
    const request = createRequest()
    await request.patch(`/api/v1/hostnames/${hostnameId}`).send({ crawlable: false }).expect(401)
  })

  it('returns 403 when authenticated as non-admin', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser!)
    await request.patch(`/api/v1/hostnames/${hostnameId}`).send({ crawlable: false }).expect(403)
  })

  it('returns 415 when content-type is not json', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    await request.patch(`/api/v1/hostnames/${hostnameId}`).send('not-json').expect(415)
  })

  it('returns 422 when id is not a UUID', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    await request.patch('/api/v1/hostnames/not-a-uuid').send({ crawlable: false }).expect(422)
  })

  it('returns 404 when hostname does not exist', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    await request
      .patch('/api/v1/hostnames/00000000-0000-0000-0000-000000000000')
      .send({ crawlable: false })
      .expect(404)
  })

  it('returns 422 when body has no valid fields', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    await request
      .patch(`/api/v1/hostnames/${hostnameId}`)
      .send({ unrelated_field: true })
      .expect(422)
  })

  it('updates crawlable and returns 204', async () => {
    const id = await insertTestUrlHostname({
      hostname: `patch-crawlable-${Date.now()}.example.com`,
      blocked: false,
      crawlable: true,
    })
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    await request.patch(`/api/v1/hostnames/${id}`).send({ crawlable: false }).expect(204)
  })

  it('invalidates cached hostname detail after a flag update', async () => {
    const hostname = `patch-cache-${Date.now()}.example.com`
    const id = await insertTestUrlHostname({
      hostname,
      blocked: false,
      crawlable: true,
    })
    const request = createRequest()
    await request.authenticateAs(adminUser!)

    const before = await request.get(`/api/v1/hostnames/${hostname}`).expect(200)
    expect(before.body.hostname.crawlable).toBe(true)

    await request.patch(`/api/v1/hostnames/${id}`).send({ crawlable: false }).expect(204)

    const after = await request.get(`/api/v1/hostnames/${hostname}`).expect(200)
    expect(after.body.hostname.crawlable).toBe(false)
  })

  it('updates link_rel_follow and returns 204', async () => {
    const id = await insertTestUrlHostname({
      hostname: `patch-linkrel-${Date.now()}.example.com`,
      blocked: false,
      crawlable: true,
    })
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    await request.patch(`/api/v1/hostnames/${id}`).send({ link_rel_follow: true }).expect(204)
  })

  it('returns 422 when blocked:true is combined with other fields', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    await request
      .patch(`/api/v1/hostnames/${hostnameId}`)
      .send({ blocked: true, crawlable: false })
      .expect(422)
  })

  it('blocks hostname and returns result object', async () => {
    const id = await insertTestUrlHostname({
      hostname: `patch-block-${Date.now()}.example.com`,
      blocked: false,
      crawlable: true,
    })
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    const response = await request
      .patch(`/api/v1/hostnames/${id}`)
      .send({ blocked: true })
      .expect(200)
    expect(typeof response.body.blocked_hostname_count).toBe('number')
    expect(typeof response.body.soft_deleted_relation_count).toBe('number')
    expect(typeof response.body.penalized_user_count).toBe('number')
  })

  it('invalidates cached subdomain detail after blocking a parent hostname', async () => {
    const suffix = `${Date.now()}.example.com`
    const id = await insertTestUrlHostname({
      hostname: `patch-block-cache-${suffix}`,
      blocked: false,
      crawlable: true,
    })
    const subdomain = `sub.patch-block-cache-${suffix}`
    await insertTestUrlHostname({
      hostname: subdomain,
      blocked: false,
      crawlable: true,
    })
    const request = createRequest()
    await request.authenticateAs(adminUser!)

    const before = await request.get(`/api/v1/hostnames/${subdomain}`).expect(200)
    expect(before.body.hostname.blocked).toBe(false)

    await request.patch(`/api/v1/hostnames/${id}`).send({ blocked: true }).expect(200)

    const after = await request.get(`/api/v1/hostnames/${subdomain}`).expect(200)
    expect(after.body.hostname.blocked).toBe(true)
  })

  it('unblocks hostname and returns 204', async () => {
    const id = await insertTestUrlHostname({
      hostname: `patch-unblock-${Date.now()}.example.com`,
      blocked: true,
      crawlable: true,
    })
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    await request.patch(`/api/v1/hostnames/${id}`).send({ blocked: false }).expect(204)
  })

  it('updates ignore_robots_txt and returns 204', async () => {
    const id = await insertTestUrlHostname({
      hostname: `patch-ignore-robots-${Date.now()}.example.com`,
      blocked: false,
      crawlable: true,
    })
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    await request.patch(`/api/v1/hostnames/${id}`).send({ ignore_robots_txt: true }).expect(204)
  })

  it('updates unreliable_status_codes and returns 204', async () => {
    const id = await insertTestUrlHostname({
      hostname: `patch-unreliable-status-${Date.now()}.example.com`,
      blocked: false,
      crawlable: true,
    })
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    await request
      .patch(`/api/v1/hostnames/${id}`)
      .send({ unreliable_status_codes: [410, 404, 404] })
      .expect(204)

    expect(await getUrlHostnameUnreliableStatusCodesForTest(id)).toEqual([404, 410])
  })

  it('clears unreliable_status_codes and returns 204', async () => {
    const id = await insertTestUrlHostname({
      hostname: `patch-clear-unreliable-status-${Date.now()}.example.com`,
      blocked: false,
      crawlable: true,
    })
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    await request
      .patch(`/api/v1/hostnames/${id}`)
      .send({ unreliable_status_codes: [404] })
      .expect(204)
    await request
      .patch(`/api/v1/hostnames/${id}`)
      .send({ unreliable_status_codes: null })
      .expect(204)

    expect(await getUrlHostnameUnreliableStatusCodesForTest(id)).toBeNull()
  })

  it('returns 400 when unreliable_status_codes contains a non-4xx status', async () => {
    const id = await insertTestUrlHostname({
      hostname: `patch-bad-unreliable-status-${Date.now()}.example.com`,
      blocked: false,
      crawlable: true,
    })
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    await request
      .patch(`/api/v1/hostnames/${id}`)
      .send({ unreliable_status_codes: [500] })
      .expect(400)
  })
})
