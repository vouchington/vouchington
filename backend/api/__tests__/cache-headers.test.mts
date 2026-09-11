import { describe, expect, it } from 'vitest'
import request from 'supertest'
import { createVouchaApiApp } from '../app.mts'
import { setAnonymousPublicCacheHeaders } from '../cache-headers.mts'

describe('anonymous public cache headers', () => {
  it('preserves auth-sensitive Vary members when api-server compresses a response', async () => {
    const app = createVouchaApiApp()
    app.route('/cached').get(ctx => {
      ctx.set('Vary', 'Origin, Accept-Language')
      setAnonymousPublicCacheHeaders(ctx, null, 60)
      ctx.json({ body: 'x'.repeat(2048) })
    })

    const response = await request(app.callback()).get('/cached').set('Accept-Encoding', 'gzip')

    expect(response.headers['content-encoding']).toBe('gzip')
    expect(response.headers.vary?.split(',').map(value => value.trim())).toEqual([
      'Origin',
      'Accept-Language',
      'Cookie',
      'Authorization',
      'Accept-Encoding',
    ])
  })
})
