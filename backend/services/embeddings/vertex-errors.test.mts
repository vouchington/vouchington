import { describe, expect, it, vi } from 'vitest'
import { createVertexHttpFixture } from '@voucha/test-helpers/vertex-http'
import { createEmbedding } from './single/request.mts'
import { getVertexAccessToken } from './vertex.mts'

describe('Vertex authentication and model response failures', () => {
  it('keeps rejected federation exchanges retryable and caches only a usable impersonated token', async () => {
    const fixture = createVertexHttpFixture({ authenticationResponses: false })
    const sts = fixture.agent.get('https://sts.googleapis.com')
    const iam = fixture.agent.get('https://iamcredentials.googleapis.com')
    sts
      .intercept({ method: 'POST', path: '/v1/token' })
      .reply(403, { error: 'synthetic private STS body' })
    sts.intercept({ method: 'POST', path: '/v1/token' }).reply(200, {})
    sts
      .intercept({ method: 'POST', path: '/v1/token' })
      .reply(200, { access_token: 'synthetic-sts-token' })
      .times(3)
    iam
      .intercept({ method: 'POST', path: /:generateAccessToken$/ })
      .reply(403, { error: 'synthetic private IAM body' })
    iam
      .intercept({ method: 'POST', path: /:generateAccessToken$/ })
      .reply(200, { accessToken: 'unusable', expireTime: 'not-a-date' })
    iam
      .intercept({ method: 'POST', path: /:generateAccessToken$/ })
      .reply(200, { accessToken: 'synthetic-recovered-token', expireTime: '2099-01-01T00:00:00Z' })

    await fixture.run(async () => {
      vi.stubEnv('VERTEX_LOCATION', 'eu')
      await expect(getVertexAccessToken()).rejects.toThrow('VERTEX_LOCATION must be us')
      vi.stubEnv('VERTEX_LOCATION', 'us')
      await expect(getVertexAccessToken()).rejects.toThrow(
        /^Google STS authentication failed \(403\)$/,
      )
      await expect(getVertexAccessToken()).rejects.toThrow('Google STS returned no access token')
      await expect(getVertexAccessToken()).rejects.toThrow(
        /^Google IAM authentication failed \(403\)$/,
      )
      await expect(getVertexAccessToken()).rejects.toThrow(
        'Google IAM returned an invalid access token',
      )
      await expect(getVertexAccessToken()).resolves.toBe('synthetic-recovered-token')
      await expect(getVertexAccessToken()).resolves.toBe('synthetic-recovered-token')
    })
    fixture.agent.assertNoPendingInterceptors()
  })

  it('rejects a successful model HTTP response without documented embedding values', async () => {
    const fixture = createVertexHttpFixture()
    fixture.agent
      .get('https://aiplatform.us.rep.googleapis.com')
      .intercept({ method: 'POST', path: /:embedContent$/ })
      .reply(200, { embedding: {} })
    await expect(
      fixture.run(() =>
        createEmbedding('synthetic query', { intent: 'query', entityType: 'search' }),
      ),
    ).rejects.toThrow('Vertex embedding response did not include values')
  })
})
