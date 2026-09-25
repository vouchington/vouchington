import { createHash, randomBytes } from 'node:crypto'
import { AUTH_STATE } from '../../helpers/auth-state.mts'
import { navigateTo } from '../../helpers/navigate-to.mts'
import { expect, test } from '../../helpers/test.mts'

const USER_MCP_RESOURCE_METADATA_PATH = '/.well-known/oauth-protected-resource/api/v1/mcp'
const SCOPES = 'mcp.user:read mcp.user:write'

test.describe('OAuth consent', () => {
  test.use({ storageState: AUTH_STATE })

  test('reviews and approves a registered client request', async ({
    page,
    playwright,
    baseURL,
  }) => {
    const redirectUri = `https://oauth-client.example/callback/${randomBytes(8).toString('hex')}`
    const registrationContext = await playwright.request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    })
    const registration = await registrationContext.post('/register', {
      data: {
        client_name: `Playwright OAuth client ${randomBytes(6).toString('hex')}`,
        redirect_uris: [redirectUri],
        scope: SCOPES,
      },
    })
    const registrationBody = await registration.text()
    expect(registration.status(), registrationBody).toBe(201)
    const client = JSON.parse(registrationBody) as { client_id: string; client_name: string }
    const resource = await discoverUserMcpResource(registrationContext)
    await registrationContext.dispose()
    const verifier = randomBytes(32).toString('base64url')
    const challenge = createHash('sha256').update(verifier).digest('base64url')
    const state = randomBytes(16).toString('base64url')
    const authorize = new URLSearchParams({
      client_id: client.client_id,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
      resource,
      response_type: 'code',
      scope: SCOPES,
      state,
    })

    await page.route(`${redirectUri}*`, route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<main>OAuth callback</main>' }),
    )
    await navigateTo(page, `/authorize?${authorize.toString()}`)

    await expect(page).toHaveURL(/\/oauth\/consent\?request_id=/)
    await expect(page.getByTestId('oauth-consent-card')).toBeVisible()
    await expect(page.getByTestId('oauth-consent-title')).toContainText(client.client_name)
    await expect(page.getByTestId('oauth-consent-resource')).toHaveText(resource)
    await expect(page.getByTestId('oauth-consent-scopes')).toContainText('mcp.user:read')
    await expect(page.getByTestId('oauth-consent-scopes')).toContainText('mcp.user:write')

    const decisionResponse = page.waitForResponse(
      response =>
        response.url().includes('/api/v1/oauth/authorization-requests/') &&
        response.url().endsWith('/decisions') &&
        response.status() === 200,
    )
    await page.getByTestId('oauth-consent-approve').click()
    await decisionResponse
    await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(redirectUri)}\\?`))
    const callback = new URL(page.url())
    expect(callback.searchParams.get('code')).toMatch(/^voucha_code_/)
    expect(callback.searchParams.get('state')).toBe(state)
  })

  test('denies a registered client request without issuing a code', async ({
    page,
    playwright,
    baseURL,
  }) => {
    const redirectUri = `https://oauth-client.example/callback/${randomBytes(8).toString('hex')}`
    const registrationContext = await playwright.request.newContext({
      baseURL,
      ignoreHTTPSErrors: true,
    })
    const registration = await registrationContext.post('/register', {
      data: {
        client_name: `Playwright denied OAuth client ${randomBytes(6).toString('hex')}`,
        redirect_uris: [redirectUri],
        scope: SCOPES,
      },
    })
    const registrationBody = await registration.text()
    expect(registration.status(), registrationBody).toBe(201)
    const client = JSON.parse(registrationBody) as { client_id: string }
    const resource = await discoverUserMcpResource(registrationContext)
    await registrationContext.dispose()
    const verifier = randomBytes(32).toString('base64url')
    const state = randomBytes(16).toString('base64url')
    const authorize = new URLSearchParams({
      client_id: client.client_id,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
      resource,
      response_type: 'code',
      scope: SCOPES,
      state,
    })

    await page.route(`${redirectUri}*`, route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<main>OAuth callback</main>' }),
    )
    await navigateTo(page, `/authorize?${authorize.toString()}`)

    await page.getByTestId('oauth-consent-deny').click()
    await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(redirectUri)}\?`))
    const callback = new URL(page.url())
    expect(callback.searchParams.get('error')).toBe('access_denied')
    expect(callback.searchParams.get('code')).toBeNull()
    expect(callback.searchParams.get('state')).toBe(state)
  })
})

type MetadataRequestContext = {
  get(path: string): Promise<{ status(): number; text(): Promise<string> }>
}

// MCP clients learn the canonical resource from RFC 9728 metadata rather than hardcoding an origin.
async function discoverUserMcpResource(context: MetadataRequestContext): Promise<string> {
  const response = await context.get(USER_MCP_RESOURCE_METADATA_PATH)
  const body = await response.text()
  expect(response.status(), body).toBe(200)
  return (JSON.parse(body) as { resource: string }).resource
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
