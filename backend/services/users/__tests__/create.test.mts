import {
  createRandomEmailAddress,
  insertTestOAuthAccount,
  createTestUserDirect,
  insertSessionReferralAttribution,
  getUserReferrerId,
  getFollowExists,
  readAllQueueJobs,
} from '@voucha/test-helpers'
import { it, expect, describe } from 'vitest'
import { upsertUser } from '../create.mts'
import { PRIVACY_POLICY_VERSION, TERMS_OF_SERVICE_VERSION } from '../create-helpers.mts'
import { deleteUserAndDrainForTest } from '../delete-test-support.mts'
import { getPrivateUserByAny } from '../get.mts'
import { upsertOAuthAccount } from '@services/oauth-accounts'
import { grantConsent } from '@services/user-consents/create'
import { getActiveConsents } from '@services/user-consents/get'
import type { UserConsent } from '@services/user-consents'
import { emails } from '@queues/emails/queues'
import { v7 } from 'uuid'

describe('create', () => {
  it('upsertUser finds an existing email-address user when facebook account has same email', async () => {
    // Create a user with a known email address
    const emailAddress = createRandomEmailAddress()
    const existingUser = await upsertUser({ emailAddress, sessionId: v7(), deviceId: v7() })
    // Create a facebook account whose email matches the existing user, not yet connected
    const facebookUserId = `test-facebook-${v7()}`
    const account = await insertTestOAuthAccount('facebook', facebookUserId, emailAddress)
    // upsertUser with the facebook account but no emailAddress should find the existing user
    const user = await upsertUser({
      oauthAccount: { provider: 'facebook', account },
      sessionId: v7(),
      deviceId: v7(),
    })

    expect(user.id).toEqual(existingUser.id)
    expect(user.email_address).toEqual(emailAddress)
  })

  it('upsertUser creates a new user via facebook account and finds them on subsequent login', async () => {
    const facebookUserId = `test-facebook-${v7()}`
    const account = await insertTestOAuthAccount(
      'facebook',
      facebookUserId,
      createRandomEmailAddress(),
    )
    const user1 = await upsertUser({
      oauthAccount: { provider: 'facebook', account },
      sessionId: v7(),
      deviceId: v7(),
    })
    // Re-fetch to confirm the facebook account is connected
    const fetched = await getPrivateUserByAny(user1.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.facebook_account).not.toBeNull()

    // Second login with the same facebook account returns the same user
    const user2 = await upsertUser({
      oauthAccount: { provider: 'facebook', account },
      sessionId: v7(),
      deviceId: v7(),
    })
    expect(user2.id).toEqual(user1.id)
  })

  it('upsertUser creates a new user when signing up again with an OAuth account after account deletion', async () => {
    const facebookUserId = `test-facebook-resignup-${v7()}`
    const emailAddress = createRandomEmailAddress()
    const firstAccount = await upsertOAuthAccount('facebook', facebookUserId, emailAddress, {})
    const firstUser = await upsertUser({
      oauthAccount: { provider: 'facebook', account: firstAccount },
      sessionId: v7(),
      deviceId: v7(),
    })

    await deleteUserAndDrainForTest(firstUser, firstUser)

    expect(await getPrivateUserByAny(firstUser.id)).toBeNull()

    const secondAccount = await upsertOAuthAccount('facebook', facebookUserId, emailAddress, {})
    const secondUser = await upsertUser({
      oauthAccount: { provider: 'facebook', account: secondAccount },
      sessionId: v7(),
      deviceId: v7(),
    })

    expect(secondUser.id).not.toEqual(firstUser.id)
    expect(secondUser.facebook_account?.id).toEqual(facebookUserId)

    const fetchedSecondUser = await getPrivateUserByAny(secondUser.id)
    expect(fetchedSecondUser).not.toBeNull()
    expect(fetchedSecondUser!.facebook_account?.id).toEqual(facebookUserId)

    const consents = await getActiveConsents(secondUser.id)
    expect(consents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          consent_type: 'privacy_policy',
          version: PRIVACY_POLICY_VERSION,
        }),
        expect.objectContaining({
          consent_type: 'terms_of_service',
          version: TERMS_OF_SERVICE_VERSION,
        }),
      ]),
    )
  })

  it('new user created with session attribution gets referrer_id set', async () => {
    const referrerUser = await createTestUserDirect()

    const sessionId = v7()
    await insertSessionReferralAttribution(sessionId, referrerUser!.id)

    const newUser = await upsertUser({
      emailAddress: createRandomEmailAddress(),
      sessionId,
      deviceId: v7(),
    })
    expect(await getUserReferrerId(newUser.id)).toBe(referrerUser!.id)
  })

  it('new user with no session attribution gets referrer_id = null', async () => {
    const newUser = await upsertUser({
      emailAddress: createRandomEmailAddress(),
      sessionId: v7(),
      deviceId: v7(),
    })
    expect(await getUserReferrerId(newUser.id)).toBeNull()
  })

  it('new user with referral session auto-follows the referrer', async () => {
    const referrer = await createTestUserDirect()

    const sessionId = v7()
    await insertSessionReferralAttribution(sessionId, referrer.id)

    const newUser = await upsertUser({
      emailAddress: createRandomEmailAddress(),
      sessionId,
      deviceId: v7(),
    })
    // `processAutoFollowReferrer` (backend/workers/entity-listeners) is what creates this follow
    // relation; poll the observable relation row instead of importing
    // `@workers/entity-listeners/test-support` — this package must never depend on the worker
    // package (workers/CLAUDE.md: workers depend on services, never the reverse).
    await expect.poll(() => getFollowExists(newUser.id, referrer.id)).toBe(true)
  })

  it('existing user logging in does not have referrer_id overwritten', async () => {
    const referrerUser = await createTestUserDirect()

    // Create a new user with a referrer
    const sessionId = v7()
    await insertSessionReferralAttribution(sessionId, referrerUser!.id)
    const emailAddress = createRandomEmailAddress()
    const existingUser = await upsertUser({ emailAddress, sessionId, deviceId: v7() })
    // Verify referrer_id is set
    expect(await getUserReferrerId(existingUser.id)).toBe(referrerUser!.id)

    // Login again with a different session that has a different referrer
    const anotherReferrer = await createTestUserDirect()
    const newSessionId = v7()
    await insertSessionReferralAttribution(newSessionId, anotherReferrer!.id)

    // This should return the existing user without overwriting referrer_id
    await upsertUser({ emailAddress, sessionId: newSessionId, deviceId: v7() })

    expect(await getUserReferrerId(existingUser.id)).toBe(referrerUser!.id)
  })

  it('upsertUser upgrades stale consent versions to current on sign-in', async () => {
    const emailAddress = createRandomEmailAddress()
    const user = await upsertUser({ emailAddress, sessionId: v7(), deviceId: v7() })

    // Overwrite consents with old versions
    await grantConsent(user.id, 'privacy_policy', '2000-01-01')
    await grantConsent(user.id, 'terms_of_service', '2000-01-01')

    // Sign in again — should sync consents to current versions
    await upsertUser({ emailAddress, sessionId: v7(), deviceId: v7() })

    const consents = await getActiveConsents(user.id)
    expect(consents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          consent_type: 'privacy_policy',
          version: PRIVACY_POLICY_VERSION,
        }),
        expect.objectContaining({
          consent_type: 'terms_of_service',
          version: TERMS_OF_SERVICE_VERSION,
        }),
      ]),
    )
    expect(consents.filter((c: UserConsent) => c.consent_type === 'privacy_policy')).toHaveLength(1)
    expect(consents.filter((c: UserConsent) => c.consent_type === 'terms_of_service')).toHaveLength(
      1,
    )
  })

  describe('welcome email', () => {
    it('queues a welcome email for a new user with an email address', async () => {
      const emailAddress = createRandomEmailAddress()
      const newUser = await upsertUser({ emailAddress, sessionId: v7(), deviceId: v7() })

      await expect
        .poll(async () => {
          const jobs = await readAllQueueJobs(emails)
          return jobs.some(job => {
            const data = job.data as {
              input?: { emailAddress?: string; userId?: string }
              variables?: { userName?: string }
            }
            return (
              job.name === 'processSendWelcomeEmail' &&
              data.input?.userId === newUser.id &&
              data.input?.emailAddress === undefined &&
              data.variables?.userName === undefined
            )
          })
        })
        .toBe(true)
    })

    it('queues a welcome email for a new OAuth signup with a provider email address', async () => {
      const facebookUserId = `test-facebook-with-email-${v7()}`
      const providerEmailAddress = createRandomEmailAddress()
      const account = await insertTestOAuthAccount('facebook', facebookUserId, providerEmailAddress)
      const newUser = await upsertUser({
        oauthAccount: { provider: 'facebook', account },
        sessionId: v7(),
        deviceId: v7(),
      })
      expect(newUser.email_address).toBeFalsy()

      await expect
        .poll(async () => {
          const jobs = await readAllQueueJobs(emails)
          return jobs.some(job => {
            const data = job.data as { input?: { emailAddress?: string; userId?: string } }
            return (
              job.name === 'processSendWelcomeEmail' &&
              data.input?.userId === newUser.id &&
              data.input?.emailAddress === undefined
            )
          })
        })
        .toBe(true)
    })

    it('queues a user-targeted welcome email for a new OAuth user with no email address', async () => {
      const facebookUserId = `test-facebook-no-email-${v7()}`
      const account = await insertTestOAuthAccount('facebook', facebookUserId)
      const newUser = await upsertUser({
        oauthAccount: { provider: 'facebook', account },
        sessionId: v7(),
        deviceId: v7(),
      })
      expect(newUser.email_address).toBeFalsy()

      await expect
        .poll(async () => {
          const jobs = await readAllQueueJobs(emails)
          return jobs.some(job => {
            const data = job.data as { input?: { emailAddress?: string; userId?: string } }
            return (
              job.name === 'processSendWelcomeEmail' &&
              data.input?.userId === newUser.id &&
              data.input?.emailAddress === undefined
            )
          })
        })
        .toBe(true)
    })
  })
})
