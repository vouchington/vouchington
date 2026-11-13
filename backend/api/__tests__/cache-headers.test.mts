import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createVouchaApiApp } from '../create-voucha-api-app.mts'
import { setAnonymousPublicCacheHeaders, setPublicCacheHeaders } from '../cache-headers.mts'

describe('anonymous public cache headers', () => {
  it('preserves auth-sensitive Vary members when api-server compresses a response', async () => {
    const app = createVouchaApiApp()
    app.route('/cached').get(ctx => {
      ctx.set('Vary', 'Origin, Accept-Language')
      setAnonymousPublicCacheHeaders(ctx, null)
      ctx.json({ body: 'x'.repeat(1013) })
    })

    const response = await request(app.callback()).get('/cached').set('Accept-Encoding', 'gzip')

    expect(response.headers['cache-control']).toBe('public')
    expect(response.headers['content-encoding']).toBe('gzip')
    expect(response.headers.vary?.split(',').map(value => value.trim())).toEqual([
      'Origin',
      'Accept-Language',
      'Cookie',
      'Authorization',
      'Accept-Encoding',
    ])
  })

  it('sets plain public without dropping existing Vary members', async () => {
    const app = createVouchaApiApp()
    app.route('/public').get(ctx => {
      ctx.set('Vary', 'Origin')
      setPublicCacheHeaders(ctx)
      ctx.json({ ok: true })
    })

    const response = await request(app.callback()).get('/public').expect(200)
    expect(response.headers['cache-control']).toBe('public')
    expect(response.headers.vary).toBe('Origin, Cookie, Authorization')
  })
})
