import { randomUUID } from 'node:crypto'
import { SEEDED_IDS } from '../../../integration-tests/web/helpers/constants.mts'
import { withCleanUser } from '../../helpers/auth.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { expect, test, type Page } from '../../helpers/test.mts'

interface BrowserFetchResult {
  status: number
  cacheControl: string | null
  cacheStatus: string | null
  vary: string | null
  body: Record<string, unknown>
}

async function browserFetch(page: Page, path: string): Promise<BrowserFetchResult> {
  return page.evaluate(async requestPath => {
    const response = await window.fetch(requestPath)
    return {
      status: response.status,
      cacheControl: response.headers.get('cache-control'),
      cacheStatus: response.headers.get('x-voucha-cache'),
      vary: response.headers.get('vary'),
      body: (await response.json()) as Record<string, unknown>,
    } satisfies BrowserFetchResult
  }, path)
}

test.describe('Signed-out to signed-in caching', () => {
  test('does not reuse an anonymous API response after sign-in', async ({ page }) => {
    await navigateTo(page, '/login')

    const requestPath = `/api/v1/posts/${SEEDED_IDS.discussion}?cache-transition=${randomUUID()}`
    const anonymousResponse = await browserFetch(page, requestPath)
    const varyTokens = (anonymousResponse.vary ?? '')
      .split(',')
      .map(token => token.trim().toLowerCase())

    expect(anonymousResponse.status).toBe(200)
    expect(anonymousResponse.cacheStatus).toBe('DISPATCHED')
    expect(anonymousResponse.cacheControl).toContain('public')
    expect(varyTokens).toEqual(expect.arrayContaining(['cookie', 'authorization']))
    expect(anonymousResponse.body).not.toHaveProperty('election_vote')

    await withCleanUser(page)

    const authenticatedResponse = await browserFetch(page, requestPath)
    expect(authenticatedResponse.status).toBe(200)
    expect(authenticatedResponse.cacheStatus).toBe('BYPASS')
    expect(authenticatedResponse.body).toHaveProperty('election_vote')
  })
})
