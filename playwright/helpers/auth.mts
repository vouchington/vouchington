import type { Page } from '@playwright/test'
import { createDeviceAndSessionTokens } from '../../backend/services/jwt-session/index.mts'
import { mintUUIDv7 } from '../../ts-shared/session-jwt/index.mts'
import type { createTestUser } from '../../backend/test-helpers/index.mts'
import type { PrivateUser } from '../../backend/services/users/types.mts'
import { TEST_USER_ID } from '../../integration-tests/web/helpers/constants.mts'
import { randomSuffix } from './random-id.mts'
import { retryOnConnectionLost } from './retry-on-connection-lost.mts'

export const TEST_USER_USERNAME = 'tests'

type LoginAsUserDependencies = {
  createDeviceAndSessionTokens: typeof createDeviceAndSessionTokens
  mintUUIDv7: typeof mintUUIDv7
  retryOnConnectionLost: typeof retryOnConnectionLost
}

export async function loginAsTestUser(
  page: Page,
  dependencies?: Partial<LoginAsUserDependencies>,
): Promise<void> {
  await loginAsUser(page, TEST_USER_ID, dependencies)
}

/** @alias loginAsTestUser — semantic alias; the seeded test user is admin-capable. */
export const loginAsAdmin = loginAsTestUser

// Creates device + session JWTs directly and injects them as cookies, bypassing
// the email login API and MFA check. This prevents concurrent loginAsTestUser
// calls from clearing passkeys inserted by a concurrent passkeys test.
//
// Navigates once to '/' only to establish the cookie origin, then injects cookies
// and returns. It performs NO post-login navigation (no /feed/news) — callers issue
// their own navigateTo(), so an intermediate feed render would be wasted work.
export async function loginAsUser(
  page: Page,
  userId: string,
  dependencies?: Partial<LoginAsUserDependencies>,
): Promise<void> {
  const createTokens = dependencies?.createDeviceAndSessionTokens ?? createDeviceAndSessionTokens
  const createUUIDv7 = dependencies?.mintUUIDv7 ?? mintUUIDv7
  const retry = dependencies?.retryOnConnectionLost ?? retryOnConnectionLost
  const did = createUUIDv7()
  const { deviceToken, sessionToken } = await createTokens({ did, uid: userId })

  await retry(async () => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 })
    const origin = new URL(page.url()).origin
    await page.context().addCookies([
      {
        name: 'dt',
        value: deviceToken.token,
        url: origin,
        httpOnly: true,
        sameSite: 'Lax',
      },
      {
        name: 'st',
        value: sessionToken.token,
        url: origin,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ])
  })
}

// Creates a site moderator user (has 'moderator' role, no 'administrator' role).
// The caller is responsible for calling loginAsUser(page, user.id) and then
// navigateTo() to the target route.
export async function createSiteModeratorUser(): Promise<PrivateUser> {
  // Dynamic import keeps backend/test-helpers out of the module-level import
  // graph so auth unit tests can load this file without a running Valkey instance.
  const { createTestUser: _createTestUser } = await import('../../backend/test-helpers/index.mts')
  const user = await _createTestUser({
    username: `pw-mod-${randomSuffix()}`,
    extraRoles: ['moderator'],
  })
  if (!user) throw new Error('createSiteModeratorUser: failed to create user')
  return user
}

// Creates a fully isolated fresh user (no follows, votes, posts, saves, or
// notifications) and logs them in via cookie injection. Use this instead of
// AUTH_STATE for any spec that asserts activity-derived state — the seeded
// test user carries accumulated follows, votes, saves, and notifications that
// make such assertions non-deterministic across runs.
//
// Like loginAsUser, it does NOT navigate after login — the caller issues its
// own navigateTo(). Returns the newly created user so the spec can seed
// related entities (follows, votes, etc.) owned by or targeted at this user.
export async function withCleanUser(
  page: Page,
  options?: Parameters<typeof createTestUser>[0],
): Promise<PrivateUser> {
  // Dynamic import keeps backend/test-helpers (and its Valkey pool) out of the
  // module-level import graph so the auth unit tests can load this file without
  // a running Valkey instance.
  const { createTestUser: _createTestUser } = await import('../../backend/test-helpers/index.mts')
  const user = await _createTestUser({ username: `pw-clean-${randomSuffix()}`, ...options })
  if (!user) throw new Error('withCleanUser: failed to create user')
  await loginAsUser(page, user.id)
  return user
}
