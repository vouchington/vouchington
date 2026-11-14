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
  it('applies the anonymous TTL and bypasses cache after authentication', async () => {
    const client = new WebIntegrationClient(workerOrigin, traceOrigin, artifactsDir)

    const requestPath = `/api/v1/posts/${SEEDED_IDS.discussion}?cache-transition=${randomUUID()}`
    const firstVisitResponse = await client.request(requestPath, {
      userAgent: PLAYWRIGHT_CHROME_UA,
    })
    const firstVisitBody = (await firstVisitResponse.json()) as Record<string, unknown>

    expect(firstVisitResponse.status).toBe(200)
    expect(firstVisitResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(firstVisitResponse.headers.get('cache-control')).toBe(
      'no-store, max-age=0, must-revalidate',
    )
    expect(firstVisitResponse.headers.getSetCookie()).toEqual(
      expect.arrayContaining([expect.stringMatching(/^dt=.+;/), expect.stringMatching(/^st=.+;/)]),
    )
    expect(client.getCookie('dt')).toBeTruthy()
    expect(client.getCookie('st')).toBeTruthy()
    expect(firstVisitBody).not.toHaveProperty('election_vote')

    const anonymousResponse = await client.request(requestPath, {
      userAgent: PLAYWRIGHT_CHROME_UA,
    })
    const anonymousBody = (await anonymousResponse.json()) as Record<string, unknown>

    expect(anonymousResponse.status).toBe(200)
    expect(anonymousResponse.headers.get('x-voucha-cache')).toBe('DISPATCHED')
    expect(anonymousResponse.headers.get('cache-control')).toBe(
      'public, max-age=30, stale-while-revalidate=60, stale-if-error=86400',
    )
    expect(anonymousResponse.headers.get('set-cookie')).toBeNull()
    expect(anonymousBody).not.toHaveProperty('election_vote')

    const authCookies = await createTestAuthCookies(TEST_USER_ID, PLAYWRIGHT_CHROME_UA)
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
    expect(authenticatedResponse.headers.get('cache-control')).toBe('private, no-store')
    expect(authenticatedBody).toHaveProperty('election_vote')
    const authenticatedOriginRequest = tracedRequests.find(request => request.path === requestPath)
    expect(authenticatedOriginRequest).toBeDefined()
    expect(authenticatedOriginRequest?.cookieHeader).toContain('dt=')
    expect(authenticatedOriginRequest?.cookieHeader).toContain('st=')
  })
})
