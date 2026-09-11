import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { getSiteUrl } from '@modules/utils'

describe('GET /.well-known/nodeinfo', () => {
  it('returns a discovery document pointing at /nodeinfo/2.0', async () => {
    const request = createRequest()
    const response = await request.get('/.well-known/nodeinfo').expect(200)

    expect(response.body).toEqual({
      links: [
        {
          rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0',
          href: getSiteUrl('/nodeinfo/2.0'),
        },
      ],
    })
  })
})

describe('GET /nodeinfo/2.0', () => {
  it('returns a NodeInfo 2.0 document describing this instance', async () => {
    const request = createRequest()
    const response = await request.get('/nodeinfo/2.0').expect(200)

    expect(response.body).toMatchObject({
      version: '2.0',
      software: { name: 'voucha' },
      protocols: ['activitypub'],
      openRegistrations: true,
    })
    expect(typeof response.body.usage.users.total).toBe('number')
    expect(response.body.usage.users.total).toBeGreaterThanOrEqual(0)
  })
})
