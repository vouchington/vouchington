import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from 'vouchington-tooling/playwright'
import { PLAYWRIGHT_CONFIGURED_OAUTH_PROVIDERS } from '../../config/web-public-env.mts'

const directProviders = ['apple', 'facebook', 'github', 'google', 'linkedin', 'microsoft', 'x']
const webBroker = { modes: { web: true, native: false } }

test.describe('OAuth login buttons', () => {
  test('renders brokered providers with their icons inside the login button wrapper', async ({
    page,
  }) => {
    await page.route('**/api/v1/auth/oauth/providers', route =>
      route.fulfill({
        status: 200,
        json: {
          providers: ['facebook', 'github', 'google', 'linkedin', 'microsoft', 'x'],
          broker_capabilities: {
            facebook: webBroker,
            github: webBroker,
            google: webBroker,
            linkedin: webBroker,
            microsoft: webBroker,
            x: webBroker,
          },
        },
      }),
    )

    await navigateTo(page, '/login')

    const loginButtons = page.getByTestId('oauth-login-button')
    const githubButton = loginButtons.getByTestId('oauth-provider-button-github')
    await expect(githubButton).toBeVisible()
    await expect(githubButton.getByTestId('oauth-provider-icon')).toBeVisible()
    await expect(loginButtons.getByTestId('oauth-provider-button-x')).toBeVisible()
  })

  test('wraps only the direct providers the Playwright web server configures', async ({ page }) => {
    await page.route('**/api/v1/auth/oauth/providers', route =>
      route.fulfill({
        status: 200,
        json: {
          providers: ['apple', 'facebook', 'github', 'google', 'linkedin', 'microsoft', 'x'],
          broker_capabilities: {},
        },
      }),
    )

    await navigateTo(page, '/login')

    const loginButtons = page.getByTestId('oauth-login-button')

    for (const provider of directProviders) {
      await expect(loginButtons.getByTestId(`oauth-${provider}-login-button`)).toHaveCount(
        PLAYWRIGHT_CONFIGURED_OAUTH_PROVIDERS.some(configured => configured === provider) ? 1 : 0,
      )
    }
  })
})
