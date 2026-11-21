// Fixed direct-OAuth public config for the web server, so the login page renders a known set of
// direct providers whatever the developer's shell exports. Each provider needs both its
// NEXT_PUBLIC_ and bare variable pinned because the server reads either.
export const PLAYWRIGHT_CONFIGURED_OAUTH_PROVIDERS = ['github', 'x'] as const

const OAUTH_PUBLIC_ENV_NAMES = {
  apple: ['APPLE_CLIENT_ID'],
  facebook: ['FACEBOOK_APP_ID'],
  github: ['GITHUB_CLIENT_ID'],
  google: ['GOOGLE_CLIENT_ID'],
  linkedin: ['LINKEDIN_CLIENT_ID'],
  microsoft: ['MICROSOFT_CLIENT_ID'],
  x: ['X_CLIENT_ID'],
} as const

function playwrightOAuthPublicEnv(): Record<string, string> {
  const configured: ReadonlySet<string> = new Set(PLAYWRIGHT_CONFIGURED_OAUTH_PROVIDERS)
  const env: Record<string, string> = {}
  for (const [provider, names] of Object.entries(OAUTH_PUBLIC_ENV_NAMES)) {
    const value = configured.has(provider) ? `playwright-${provider}-client-id` : ''
    for (const name of names) {
      env[name] = value
      env[`NEXT_PUBLIC_${name}`] = value
    }
  }
  return env
}

const TEST_WEB_PUSH_PUBLIC_KEY =
  'BHl0gZb-cpN8lY6FjEpmYTFQc-5hFCnM3vYIVOXsHOXOtfsmYmSlEdAOO4eXw3pZTbNuubGHTODWpl_vP7C_OeY'

export function playwrightWebPublicEnv(): Record<string, string> {
  return {
    ...playwrightOAuthPublicEnv(),
    NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY:
      process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY ?? TEST_WEB_PUSH_PUBLIC_KEY,
  }
}
