import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUserDirect, insertTestUrlHostname } from '@voucha/test-helpers'
import { addUserRole } from '@services/users/roles-permissions'

describe('POST /api/v1/hostnames', () => {
  let regularUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null
  let adminUser: Awaited<ReturnType<typeof createTestUserDirect>> | null = null

  beforeAll(async () => {
    regularUser = await createTestUserDirect()
    adminUser = await createTestUserDirect()
    await addUserRole(adminUser!.id, 'administrator')
  })

  it('returns 401 when unauthenticated', async () => {
    const request = createRequest()
    await request
      .post('/api/v1/hostnames')
      .send({ hostname: `unauthenticated-${Date.now()}.example.com` })
      .expect(401)
  })

  it('returns 403 when authenticated as non-admin', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser!)
    await request
      .post('/api/v1/hostnames')
      .send({ hostname: `non-admin-${Date.now()}.example.com` })
      .expect(403)
  })

  it('returns 415 when content-type is not json', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    await request.post('/api/v1/hostnames').send('not-json').expect(415)
  })

  it('returns 422 when hostname is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    await request.post('/api/v1/hostnames').send({}).expect(422)
  })

  it('returns 422 when hostname is empty string', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    await request.post('/api/v1/hostnames').send({ hostname: '' }).expect(422)
  })

  it('strips path and returns normalized hostname', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    const response = await request
      .post('/api/v1/hostnames')
      .send({ hostname: 'example.com/some/path' })
      .expect(200)
    expect(response.body.hostname).toBe('example.com')
  })

  it('strips query string and returns normalized hostname', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    const response = await request
      .post('/api/v1/hostnames')
      .send({ hostname: 'example.com?x=1' })
      .expect(200)
    expect(response.body.hostname).toBe('example.com')
  })

  it('strips port and returns normalized hostname', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    const response = await request
      .post('/api/v1/hostnames')
      .send({ hostname: 'example.com:8080' })
      .expect(200)
    expect(response.body.hostname).toBe('example.com')
  })

  it('creates a hostname and returns id and hostname', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    const hostname = `create-${Date.now()}.example.com`
    const response = await request.post('/api/v1/hostnames').send({ hostname }).expect(200)
    expect(response.body.id).toBeTruthy()
    expect(response.body.hostname).toBe(hostname)
    expect(response.body.blocked_hostname_count).toBeUndefined()
  })

  it('normalizes protocol-prefixed hostname input', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    const hostname = `proto-${Date.now()}.example.com`
    const response = await request
      .post('/api/v1/hostnames')
      .send({ hostname: `https://${hostname}` })
      .expect(200)
    expect(response.body.hostname).toBe(hostname)
  })

  it('is idempotent — returns same id for duplicate hostname', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    const hostname = `dup-${Date.now()}.example.com`

    const first = await request.post('/api/v1/hostnames').send({ hostname }).expect(200)
    const second = await request.post('/api/v1/hostnames').send({ hostname }).expect(200)

    expect(first.body.id).toBe(second.body.id)
  })

  it('creates and immediately blocks when blocked:true is passed', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    const hostname = `block-new-${Date.now()}.example.com`
    const response = await request
      .post('/api/v1/hostnames')
      .send({ hostname, blocked: true })
      .expect(200)

    expect(response.body.id).toBeTruthy()
    expect(response.body.hostname).toBe(hostname)
    expect(typeof response.body.blocked_hostname_count).toBe('number')
    expect(typeof response.body.soft_deleted_relation_count).toBe('number')
    expect(typeof response.body.penalized_user_count).toBe('number')
  })

  it('invalidates cached subdomain detail when quick-add blocking a parent hostname', async () => {
    const request = createRequest()
    await request.authenticateAs(adminUser!)
    const hostname = `quick-block-cache-${Date.now()}.example.com`
    const subdomain = `sub.${hostname}`
    await insertTestUrlHostname({
      hostname: subdomain,
      blocked: false,
      crawlable: true,
    })

    const before = await request.get(`/api/v1/hostnames/${subdomain}`).expect(200)
    expect(before.body.hostname.blocked).toBe(false)

    await request.post('/api/v1/hostnames').send({ hostname, blocked: true }).expect(200)

    const after = await request.get(`/api/v1/hostnames/${subdomain}`).expect(200)
    expect(after.body.hostname.blocked).toBe(true)
  })
})
