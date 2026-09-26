import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  countUserDeletionAuditLogsForTest,
  createTestUser,
  insertTestPasskey,
  countTestPasskeys,
  insertTestOAuthAccount,
  connectTestOAuthAccount,
  setTestOAuthAccountTokens,
  getTestOAuthAccountRaw,
  insertTestFriend,
  countTestFriends,
  insertSessionReferralAttribution,
  getSessionReferralAttributions,
  getTestUserRaw,
  setUserMarkdown,
  setUserVerificationFields,
  insertTestVerifiedIdentity,
  getUserVerificationState,
  getVerifiedIdentityByFingerprint,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { deleteUser } from '../delete.mts'
import { deleteUserAndDrainForTest } from '../delete-test-support.mts'
import { DELETED_USER_ID } from '../constants.mts'
import { getPrivateUserByAny, getPublicUserByAny } from '../get.mts'
import { caches } from '@services/entity-cache/caches'
import { createList, getList } from '@services/lists'

// Reconstructed locally rather than imported from @services/entity-fetch: entity-fetch already
// depends on @services/users, so importing entity-fetch's cached getters back into users would
// create a fresh users<->entity-fetch cycle.
const getUserPrivateByAnyCached = caches.users_private.cacheGetByAny(getPrivateUserByAny)
const getUserPublicByAnyCached = caches.users_public.cacheGetByAny(getPublicUserByAny)

describe('deleteUser', () => {
  it('refuses to delete the tombstone user even for administrators', async () => {
    const admin = await createTestUser({ administrator: true })
    const tombstone = await getPrivateUserByAny(DELETED_USER_ID)
    expect(tombstone).not.toBeNull()
    expect(tombstone!.id).toBe(DELETED_USER_ID)

    await expect(deleteUser(admin, tombstone!)).rejects.toMatchObject({ status: 403 })

    const after = await getPrivateUserByAny(DELETED_USER_ID)
    expect(after).not.toBeNull()
    expect(after!.id).toBe(DELETED_USER_ID)
  })

  it('throws and rolls back when the user is already soft-deleted', async () => {
    const user = await createTestUser()
    await deleteUserAndDrainForTest(user, user)
    expect(await countUserDeletionAuditLogsForTest(user.id)).toBe(1)

    await expect(deleteUser(user, user)).rejects.toMatchObject({ status: 409 })
    expect(await countUserDeletionAuditLogsForTest(user.id)).toBe(1)
  })

  it('deletes passkeys on account deletion', async () => {
    const user = await createTestUser()
    const suffix = v7()
    await insertTestPasskey(user.id, suffix)
    expect(await countTestPasskeys(user.id)).toBe(1)

    await deleteUserAndDrainForTest(user, user)

    expect(await countTestPasskeys(user.id)).toBe(0)
  })

  it('scrubs OAuth PII on all providers', async () => {
    const user = await createTestUser()
    const fbId = `fb-del-test-${v7()}`
    const xId = `x-del-test-${v7()}`
    const ghId = `gh-del-test-${v7()}`
    const appleId = `apple-del-test-${v7()}`
    const googleId = `google-del-test-${v7()}`

    await insertTestOAuthAccount('facebook', fbId, `tests+fb-${v7()}@voucha.ai`)
    await connectTestOAuthAccount('facebook', user.id, fbId)
    await setTestOAuthAccountTokens('facebook', fbId, {
      accessToken: 'fb-token',
    })

    await insertTestOAuthAccount('x', xId, `tests+x-${v7()}@voucha.ai`)
    await connectTestOAuthAccount('x', user.id, xId)
    await setTestOAuthAccountTokens('x', xId, {
      accessToken: 'x-token',
      refreshToken: 'x-refresh',
    })

    await insertTestOAuthAccount('github', ghId, `tests+gh-${v7()}@voucha.ai`)
    await connectTestOAuthAccount('github', user.id, ghId)
    await setTestOAuthAccountTokens('github', ghId, {
      accessToken: 'gh-token',
      refreshToken: 'gh-refresh',
    })

    await insertTestOAuthAccount('apple', appleId, `tests+apple-${v7()}@voucha.ai`)
    await connectTestOAuthAccount('apple', user.id, appleId)

    await insertTestOAuthAccount('google', googleId, `tests+google-${v7()}@voucha.ai`)
    await connectTestOAuthAccount('google', user.id, googleId)

    const linkedinId = `linkedin-del-test-${v7()}`
    await insertTestOAuthAccount('linkedin', linkedinId, `tests+linkedin-${v7()}@voucha.ai`)
    await connectTestOAuthAccount('linkedin', user.id, linkedinId)
    await setTestOAuthAccountTokens('linkedin', linkedinId, {
      accessToken: 'linkedin-token',
      refreshToken: 'linkedin-refresh',
    })

    const microsoftId = `microsoft-del-test-${v7()}`
    await insertTestOAuthAccount('microsoft', microsoftId, `tests+microsoft-${v7()}@voucha.ai`)
    await connectTestOAuthAccount('microsoft', user.id, microsoftId)
    await setTestOAuthAccountTokens('microsoft', microsoftId, {
      accessToken: 'microsoft-token',
      refreshToken: 'microsoft-refresh',
    })

    await deleteUserAndDrainForTest(user, user)

    const fbAccount = await getTestOAuthAccountRaw('facebook', fbId)
    expect(fbAccount?.user_id).toBeNull()
    expect(fbAccount?.provider_user_email_address).toBeNull()
    expect(fbAccount?.provider_user_data).toEqual({})
    expect(fbAccount?.access_token).toBeNull()
    expect(fbAccount?.refresh_token).toBeNull()

    const xAccount = await getTestOAuthAccountRaw('x', xId)
    expect(xAccount?.user_id).toBeNull()
    expect(xAccount?.provider_user_email_address).toBeNull()
    expect(xAccount?.provider_user_data).toEqual({})
    expect(xAccount?.access_token).toBeNull()
    expect(xAccount?.refresh_token).toBeNull()

    const ghAccount = await getTestOAuthAccountRaw('github', ghId)
    expect(ghAccount?.user_id).toBeNull()
    expect(ghAccount?.provider_user_email_address).toBeNull()
    expect(ghAccount?.provider_user_data).toEqual({})
    expect(ghAccount?.access_token).toBeNull()
    expect(ghAccount?.refresh_token).toBeNull()

    const appleAccount = await getTestOAuthAccountRaw('apple', appleId)
    expect(appleAccount?.user_id).toBeNull()
    expect(appleAccount?.provider_user_email_address).toBeNull()
    expect(appleAccount?.provider_user_data).toEqual({})

    const googleAccount = await getTestOAuthAccountRaw('google', googleId)
    expect(googleAccount?.user_id).toBeNull()
    expect(googleAccount?.provider_user_email_address).toBeNull()
    expect(googleAccount?.provider_user_data).toEqual({})

    const linkedinAccount = await getTestOAuthAccountRaw('linkedin', linkedinId)
    expect(linkedinAccount?.user_id).toBeNull()
    expect(linkedinAccount?.provider_user_email_address).toBeNull()
    expect(linkedinAccount?.provider_user_data).toEqual({})
    expect(linkedinAccount?.access_token).toBeNull()
    expect(linkedinAccount?.refresh_token).toBeNull()

    const microsoftAccount = await getTestOAuthAccountRaw('microsoft', microsoftId)
    expect(microsoftAccount?.user_id).toBeNull()
    expect(microsoftAccount?.provider_user_email_address).toBeNull()
    expect(microsoftAccount?.provider_user_data).toEqual({})
    expect(microsoftAccount?.access_token).toBeNull()
    expect(microsoftAccount?.refresh_token).toBeNull()
  })

  it('deletes friends for providers that support them', async () => {
    const user = await createTestUser()
    const fbId = `fb-friends-del-${v7()}`
    const xId = `x-friends-del-${v7()}`
    const ghId = `gh-friends-del-${v7()}`
    const friendFbId = `fb-friend-${v7()}`
    const friendXId = `x-friend-${v7()}`
    const friendGhId = `gh-friend-${v7()}`

    await insertTestOAuthAccount('facebook', fbId)
    await connectTestOAuthAccount('facebook', user.id, fbId)
    await insertTestFriend('facebook', fbId, friendFbId)

    await insertTestOAuthAccount('x', xId)
    await connectTestOAuthAccount('x', user.id, xId)
    await insertTestFriend('x', xId, friendXId)

    await insertTestOAuthAccount('github', ghId)
    await connectTestOAuthAccount('github', user.id, ghId)
    await insertTestFriend('github', ghId, friendGhId)

    expect(await countTestFriends('facebook', fbId)).toBe(1)
    expect(await countTestFriends('x', xId)).toBe(1)
    expect(await countTestFriends('github', ghId)).toBe(1)

    await deleteUserAndDrainForTest(user, user)

    expect(await countTestFriends('facebook', fbId)).toBe(0)
    expect(await countTestFriends('x', xId)).toBe(0)
    expect(await countTestFriends('github', ghId)).toBe(0)
  })

  it('anonymizes referral attributions on account deletion', async () => {
    const user = await createTestUser()
    const referrer = await createTestUser()
    const sessionId = v7()

    await insertSessionReferralAttribution(sessionId, referrer.id, 'https://example.com/', user.id)

    const before = await getSessionReferralAttributions(sessionId)
    expect(before[0]?.user_id).toBe(user.id)

    await deleteUserAndDrainForTest(user, user)

    const after = await getSessionReferralAttributions(sessionId)
    expect(after[0]?.user_id).toBeNull()
  })

  it('scrubs verified-identity PII and revokes active verified identity on account deletion', async () => {
    const user = await createTestUser()
    const fingerprint = v7().replaceAll('-', '').padEnd(64, '0')
    const sessionId = `si_del_test_${v7()}`

    await setUserVerificationFields(user.id, {
      verificationStatus: 'verified',
      verificationProvider: 'stripe_identity',
      verificationCompletedAt: new Date('2025-01-01T00:00:00Z'),
      verifiedBadgeVisible: false,
      publicVerifiedNameDisplay: 'full_name',
      verifiedFirstName: 'Jane',
      verifiedLastNameInitial: 'D',
      verifiedFullName: 'Jane Doe',
      pendingVerificationSessionId: sessionId,
      pendingCheckoutSessionId: `cs_test_${v7()}`,
    })
    await insertTestVerifiedIdentity(user.id, fingerprint, sessionId)

    await deleteUserAndDrainForTest(user, user)

    // All verification columns must be scrubbed / reset to defaults on the users row
    const state = await getUserVerificationState(user.id)
    expect(state?.verification_status).toBe('unverified')
    expect(state?.verification_provider).toBeNull()
    expect(state?.verification_completed_at).toBeNull()
    expect(state?.verified_badge_visible).toBe(true) // DEFAULT
    expect(state?.public_verified_name_display).toBe('hidden') // DEFAULT
    expect(state?.verified_first_name).toBeNull()
    expect(state?.verified_last_name_initial).toBeNull()
    expect(state?.verified_full_name).toBeNull()
    expect(state?.pending_verification_session_id).toBeNull()
    expect(state?.pending_checkout_session_id).toBeNull()

    // The verified_identities row must be revoked
    const identity = await getVerifiedIdentityByFingerprint(fingerprint)
    expect(identity?.status).toBe('revoked')
    expect(identity?.revoked_at).not.toBeNull()
    expect(identity?.user_id).toBe(user.id)
  })

  it('scrubs profile fields on account deletion', async () => {
    const user = await createTestUser()
    await setUserMarkdown(user.id, 'Profile bio with personal contact details')
    expect(user.username).not.toBeNull()

    await expect(getUserPrivateByAnyCached(user.id)).resolves.toMatchObject({
      id: user.id,
      markdown: 'Profile bio with personal contact details',
    })
    await expect(getUserPublicByAnyCached(user.username!)).resolves.toMatchObject({
      id: user.id,
      markdown: 'Profile bio with personal contact details',
    })

    await deleteUserAndDrainForTest(user, user)

    const raw = await getTestUserRaw(user.id)
    expect(raw?.username).toBeNull()
    expect(raw?.markdown).toBe('')
    expect(raw?.deleted_at).not.toBeNull()
    await expect(getUserPrivateByAnyCached(user.id)).resolves.toBeNull()
    await expect(getUserPublicByAnyCached(user.username!)).resolves.toBeNull()
  })

  it('soft-deletes all active lists on user deletion', async () => {
    const user = await createTestUser()
    const list = await createList(WEB_PROVENANCE, user.id, { name: 'My List' })
    expect(list.removed_at).toBeNull()

    await deleteUserAndDrainForTest(user, user)

    expect(await getList(list.id)).toBeNull()
  })
})
