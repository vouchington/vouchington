import { createHash, randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'

import {
  getNativeOAuthClientDocument,
  getOAuthClient,
  getOAuthResourceUrl,
} from '@services/oauth-authorization-server'

describe('OAuth authorization error pages', () => {
  afterEach(() => vi.unstubAllEnvs())
  it('keeps a newly resolved metadata client local when scope validation fails', async () => {
    vi.stubEnv('SITE_ORIGIN', `https://native-${crypto.randomUUID()}.example`)
    const document = getNativeOAuthClientDocument('ios')
    const response = await createRequest()
      .get('/authorize')
      .query({
        client_id: document.client_id,
        redirect_uri: document.redirect_uris[0],
        code_challenge: createHash('sha256').update(randomBytes(32)).digest('base64url'),
        code_challenge_method: 'S256',
        resource: getOAuthResourceUrl('user'),
        response_type: 'code',
        scope: 'financial-profile:read',
        state: 'opaque-state',
      })
      .expect(400)
    expect(response.headers.location).toBeUndefined()
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.text).toContain('Authorization unavailable')
    await expect(getOAuthClient(document.client_id)).resolves.toMatchObject({
      metadata_url: document.client_id,
    })
  })

  it('renders a local page for an unregistered metadata client', async () => {
    const response = await createRequest()
      .get('/authorize')
      .query({
        client_id: `https://client.example/${randomBytes(12).toString('hex')}/metadata.json`,
        redirect_uri: 'https://app.example/callback',
        response_type: 'token',
        state: '<script>untrusted</script>',
      })
      .expect(400)
    expect(response.headers.location).toBeUndefined()
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.text).toContain('Authorization unavailable')
    expect(response.text).not.toContain('<script>')
  })
})
