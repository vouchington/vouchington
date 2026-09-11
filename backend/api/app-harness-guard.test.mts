import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'

describe('test harness: mutation media-type enforcement', () => {
  it('rejects a POST with text/plain body with 415 before routing', async () => {
    const response = await createRequest()
      .post('/api/v1/__harness-guard-probe__')
      .set('content-type', 'text/plain')
      .send('x')
    expect(response.status).toBe(415)
    expect(response.body).toMatchObject({ message: 'Unsupported Media Type' })
  })

  it('rejects a PATCH with form-urlencoded body with 415 before routing', async () => {
    const response = await createRequest()
      .patch('/api/v1/__harness-guard-probe__')
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('a=b')
    expect(response.status).toBe(415)
  })

  it('rejects a body when Content-Type is absent', async () => {
    const response = await createRequest()
      .post('/api/v1/__harness-guard-probe__')
      .send('x')
      .unset('content-type')

    expect(response.status).toBe(415)
  })

  it('rejects a multipart body before routing', async () => {
    const response = await createRequest()
      .post('/api/v1/__harness-guard-probe__')
      .set('content-type', 'multipart/form-data; boundary=probe')
      .send('--probe--\r\n')

    expect(response.status).toBe(415)
  })

  it('allows a POST with a JSON body through (404 from router, not 415 from api-server)', async () => {
    // Route does not exist → 404 from the router, proving api-server passed the request through.
    const response = await createRequest()
      .post('/api/v1/__harness-guard-probe__')
      .set('content-type', 'application/json')
      .send({ ok: 1 })
    expect(response.status).not.toBe(415)
  })

  it('allows a POST with a +json body through', async () => {
    const response = await createRequest()
      .post('/api/v1/__harness-guard-probe__')
      .set('content-type', 'application/merge-patch+json')
      .send({ ok: 1 })

    expect(response.status).not.toBe(415)
  })

  it('allows a bodyless mutation through', async () => {
    const response = await createRequest().post('/api/v1/__harness-guard-probe__')

    expect(response.status).not.toBe(415)
  })

  it('allows GET requests through regardless of Content-Type', async () => {
    const response = await createRequest()
      .get('/api/v1/__harness-guard-probe__')
      .set('content-type', 'text/plain')

    expect(response.status).not.toBe(415)
  })
})
