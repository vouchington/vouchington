import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createTestAuthCookies } from '../helpers/auth.mts'
import { WebIntegrationClient } from '../helpers/client.mts'
import { PLAYWRIGHT_CHROME_UA, SEEDED_IDS, TEST_USER_ID } from '../helpers/constants.mts'

const workerOrigin = process.env.WEB_INTEGRATION_WORKER_ORIGIN
const traceOrigin = process.env.WEB_INTEGRATION_TRACE_ORIGIN
const artifactsDir = process.env.WEB_INTEGRATION_ARTIFACTS_DIR

if (!workerOrigin || !traceOrigin || !artifactsDir) {
  throw new Error('Web integration environment is not configured')
}

describe('worker authentication cache transition', () => {
  it('bypasses an anonymous cached API response after the same client signs in', async () => {
    const client = new WebIntegrationClient(workerOrigin, traceOrigin, artifactsDir)

    const requestPath = `/api/v1/posts/${SEEDED_IDS.discussion}?cache-transition=${randomUUID()}`
    const anonymousResponse = await client.request(requestPath, {
      userAgent: PLAYWRIGHT_CHROME_UA,
    })
    const anonymousBody = (await anonymousResponse.json()) as Record<string, unknown>
    const varyTokens = (anonymousResponse.headers.get('vary') ?? '')
      .split(',')
      .map(token => token.trim().toLowerCase())

    expect(anonymousResponse.status).toBe(200)
    expect(anonymousResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(anonymousResponse.headers.get('cache-control')).toContain('public')
    expect(varyTokens).toEqual(expect.arrayContaining(['cookie', 'authorization']))
    expect(anonymousBody).not.toHaveProperty('election_vote')

    const authCookies = await createTestAuthCookies(TEST_USER_ID)
    client.setCookie('dt', authCookies.dt)
    client.setCookie('st', authCookies.st)

    const authenticatedResponse = await client.request(requestPath, {
      userAgent: PLAYWRIGHT_CHROME_UA,
    })
    const authenticatedBody = (await authenticatedResponse.json()) as Record<string, unknown>
    const authenticatedRequestId = authenticatedResponse.headers.get('x-request-id')
    const tracedRequests = await client.getTraceRequests(authenticatedRequestId)

    expect(authenticatedResponse.status).toBe(200)
    expect(authenticatedResponse.headers.get('x-voucha-cache')).toBe('BYPASS')
    expect(authenticatedBody).toHaveProperty('election_vote')
    const authenticatedOriginRequest = tracedRequests.find(request => request.path === requestPath)
    expect(authenticatedOriginRequest).toBeDefined()
    expect(authenticatedOriginRequest?.cookieHeader).toContain('dt=')
    expect(authenticatedOriginRequest?.cookieHeader).toContain('st=')
  })
})
