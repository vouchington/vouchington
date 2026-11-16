import { test, expect } from '../../helpers/test.mts'
import { navigateTo } from 'vouchington-tooling/playwright'

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
})
