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

  test('wraps a direct provider button only when its public client id is configured', async ({
    page,
  }) => {
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

    const configured = await page.evaluate(() => {
      const browserWindow = window as Window & {
        __VOUCHA_PUBLIC_CONFIG__?: Record<string, string | undefined>
      }
      const config = browserWindow['__VOUCHA_PUBLIC_CONFIG__'] ?? {}
      return {
        apple: Boolean(config['appleClientId']),
        facebook: Boolean(config['facebookAppId']),
        github: Boolean(config['githubClientId']),
        google: Boolean(config['googleClientId']),
        linkedin: Boolean(config['linkedinClientId']),
        microsoft: Boolean(config['microsoftClientId']),
        x: Boolean(config['xClientId']),
      }
    })
    const count = (provider: keyof typeof configured) => Number(configured[provider])
    const loginButtons = page.getByTestId('oauth-login-button')

    await expect(loginButtons.getByTestId('oauth-apple-login-button')).toHaveCount(count('apple'))
    await expect(loginButtons.getByTestId('oauth-facebook-login-button')).toHaveCount(
      count('facebook'),
    )
    await expect(loginButtons.getByTestId('oauth-github-login-button')).toHaveCount(count('github'))
    await expect(loginButtons.getByTestId('oauth-google-login-button')).toHaveCount(count('google'))
    await expect(loginButtons.getByTestId('oauth-linkedin-login-button')).toHaveCount(
      count('linkedin'),
    )
    await expect(loginButtons.getByTestId('oauth-microsoft-login-button')).toHaveCount(
      count('microsoft'),
    )
    await expect(loginButtons.getByTestId('oauth-x-login-button')).toHaveCount(count('x'))
  })
})
