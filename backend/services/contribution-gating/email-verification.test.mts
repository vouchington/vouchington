import { describe, it, expect } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers'
import {
  addVerifiedEmailForUser,
  addDisposableEmailForUser,
  addDisposableDomain,
  setPrimaryEmailForUser,
} from '@voucha/test-helpers/entities/email-addresses'
import {
  insertTestOAuthAccount,
  connectTestOAuthAccount,
} from '@voucha/test-helpers/entities/oauth-accounts'
import {
  getVerifiedEmailAddress,
  getVerifiedEmailAddressesBatch,
  hasVerifiedNonDisposableEmail,
  invalidateVerifiedEmailCache,
} from './email-verification.mts'

describe('hasVerifiedNonDisposableEmail', () => {
  it('prefers the primary Voucha address over provider addresses', async () => {
    const user = await createTestUserDirect()
    const suffix = crypto.randomUUID()
    const primary = `primary-${suffix}@voucha.ai`
    await setPrimaryEmailForUser(user.id, primary)
    await insertTestOAuthAccount('apple', `apple-${suffix}`, `apple-${suffix}@icloud.com`)
    await connectTestOAuthAccount('apple', user.id, `apple-${suffix}`)

    await expect(getVerifiedEmailAddress(user.id)).resolves.toBe(primary)
  })

  it('resolves provider addresses in deterministic order and excludes X', async () => {
    const user = await createTestUserDirect()
    const suffix = crypto.randomUUID()
    await insertTestOAuthAccount('microsoft', `microsoft-${suffix}`, `ms-${suffix}@outlook.com`)
    await connectTestOAuthAccount('microsoft', user.id, `microsoft-${suffix}`)
    await insertTestOAuthAccount('google', `google-${suffix}`, `google-${suffix}@gmail.com`)
    await connectTestOAuthAccount('google', user.id, `google-${suffix}`)
    await insertTestOAuthAccount('x', `x-${suffix}`, `tests+x-${suffix}@voucha.ai`)
    await connectTestOAuthAccount('x', user.id, `x-${suffix}`)

    await expect(getVerifiedEmailAddress(user.id)).resolves.toBe(`google-${suffix}@gmail.com`)

    const xOnlyUser = await createTestUserDirect()
    await insertTestOAuthAccount('x', `x-only-${suffix}`, `tests+x-only-${suffix}@voucha.ai`)
    await connectTestOAuthAccount('x', xOnlyUser.id, `x-only-${suffix}`)
    await expect(getVerifiedEmailAddress(xOnlyUser.id)).resolves.toBeNull()
  })

  it('batch resolves users with and without verified addresses', async () => {
    const withEmail = await createTestUserDirect()
    const withoutEmail = await createTestUserDirect()
    const email = `batch-${crypto.randomUUID()}@voucha.ai`
    await setPrimaryEmailForUser(withEmail.id, email)

    const resolved = await getVerifiedEmailAddressesBatch([withEmail.id, withoutEmail.id])
    expect(resolved).toEqual(
      new Map([
        [withEmail.id, email],
        [withoutEmail.id, null],
      ]),
    )
  })
  it('returns false for user with no email addresses', async () => {
    const user = await createTestUserDirect()
    await invalidateVerifiedEmailCache(user.id)

    const result = await hasVerifiedNonDisposableEmail(user.id)
    expect(result).toBe(false)
  })

  it('returns true for user with verified non-disposable email', async () => {
    const ts = Date.now()
    const user = await createTestUserDirect()
    const email = `tests+test-verified-${ts}@voucha.ai`

    await addVerifiedEmailForUser(user.id, email)

    await invalidateVerifiedEmailCache(user.id)
    const result = await hasVerifiedNonDisposableEmail(user.id)
    expect(result).toBe(true)
  })

  it('returns false for user with only disposable email domain', async () => {
    const ts = Date.now()
    const user = await createTestUserDirect()
    const disposableDomain = `disposable-test-${ts}.invalid`
    const email = `user-${ts}@${disposableDomain}`

    await addDisposableEmailForUser(user.id, email, disposableDomain)

    await invalidateVerifiedEmailCache(user.id)
    const result = await hasVerifiedNonDisposableEmail(user.id)
    expect(result).toBe(false)
  })

  it('returns true for user with OAuth Google email', async () => {
    const ts = Date.now()
    const user = await createTestUserDirect()
    const providerUserId = `google-user-${ts}`
    const email = `oauth-google-${ts}@gmail.com`

    await insertTestOAuthAccount('google', providerUserId, email)
    await connectTestOAuthAccount('google', user.id, providerUserId)

    await invalidateVerifiedEmailCache(user.id)
    const result = await hasVerifiedNonDisposableEmail(user.id)
    expect(result).toBe(true)
  })

  it('returns true for user with OAuth Apple email', async () => {
    const ts = Date.now()
    const user = await createTestUserDirect()
    const providerUserId = `apple-user-${ts}`
    const email = `oauth-apple-${ts}@icloud.com`

    await insertTestOAuthAccount('apple', providerUserId, email)
    await connectTestOAuthAccount('apple', user.id, providerUserId)

    await invalidateVerifiedEmailCache(user.id)
    const result = await hasVerifiedNonDisposableEmail(user.id)
    expect(result).toBe(true)
  })

  it('returns true for user with OAuth GitHub email', async () => {
    const ts = Date.now()
    const user = await createTestUserDirect()
    const providerUserId = `github-user-${ts}`
    const email = `oauth-github-${ts}@github.com`

    await insertTestOAuthAccount('github', providerUserId, email)
    await connectTestOAuthAccount('github', user.id, providerUserId)

    await invalidateVerifiedEmailCache(user.id)
    const result = await hasVerifiedNonDisposableEmail(user.id)
    expect(result).toBe(true)
  })

  it('returns false for user with OAuth email on disposable domain', async () => {
    const ts = Date.now()
    const user = await createTestUserDirect()
    const disposableDomain = `disposable-oauth-${ts}.invalid`
    const providerUserId = `google-disposable-${ts}`
    const email = `user-${ts}@${disposableDomain}`

    await insertTestOAuthAccount('google', providerUserId, email)
    await connectTestOAuthAccount('google', user.id, providerUserId)
    await addDisposableDomain(disposableDomain)

    await invalidateVerifiedEmailCache(user.id)
    const result = await hasVerifiedNonDisposableEmail(user.id)
    expect(result).toBe(false)
  })

  it('caches results and returns cached value on second call', async () => {
    const ts = Date.now()
    const user = await createTestUserDirect()
    const email = `cached-test-${ts}@gmail.com`

    await addVerifiedEmailForUser(user.id, email)

    await invalidateVerifiedEmailCache(user.id)
    const result1 = await hasVerifiedNonDisposableEmail(user.id)
    const result2 = await hasVerifiedNonDisposableEmail(user.id) // should use cache
    expect(result1).toBe(result2)
    expect(result1).toBe(true)
  })
})
