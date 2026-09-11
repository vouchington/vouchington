import { getPrivateUserByAny } from './get.mts'
import {
  connectOAuthAccountToUser,
  getOAuthAccountByProviderUserId,
  runOAuthAccountConnectionPostCommitEffects,
} from '@services/oauth-accounts'
import assert from 'http-assert'
import {
  enqueueOnUserCreated,
  enqueueOnUserLoggedIn,
  enqueueOnUserUpdated,
  enqueueAutoFollowReferrer,
} from '@queues/entity-listeners/enqueues'
import { enqueueReferralSignupNotification } from '@queues/notifications/enqueues'
import { enqueueSendWelcomeEmail } from '@queues/emails/enqueues'
import { getReferrerIdForSession, updateAttributionSignup } from '@services/attribution'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { normalizeKey } from '@ts-shared/utils/strings'
import { USER_CREATION_RACE } from '@modules/on-error/error-codes'
import type { PrivateUser, UpsertUserOptions, UserLoginContext } from './types.mts'
import {
  createUser,
  getUser,
  PRIVACY_POLICY_VERSION,
  TERMS_OF_SERVICE_VERSION,
} from './create-helpers.mts'
import { ensureConsentVersion } from '@services/user-consents/create'

export const upsertUser = async ({
  oauthAccount,
  emailAddress,
  phoneNumber,
  deviceId,
  sessionId,
  ipAddress,
  userAgent,
}: UpsertUserOptions): Promise<PrivateUser> => {
  const effectiveEmailAddress =
    (emailAddress || oauthAccount?.account.provider_user_email_address) ?? undefined

  const loginContext: UserLoginContext = {
    oauth_provider: oauthAccount?.provider,
    oauth_user_id: oauthAccount?.account.provider_user_id,
    email_address: effectiveEmailAddress,
    phone_number: phoneNumber,
    device_id: deviceId,
    session_id: sessionId,
    ip_address: ipAddress,
    user_agent: userAgent,
  }

  const existingUser = await getUser({
    oauthAccount,
    emailAddress: effectiveEmailAddress,
    phoneNumber,
  })
  if (existingUser) {
    if (oauthAccount && !oauthAccount.account.user_id) {
      try {
        await connectOAuthAccountToUser(
          oauthAccount.provider,
          existingUser.id,
          oauthAccount.account.provider_user_id,
        )
        await runOAuthAccountConnectionPostCommitEffects(existingUser.id)
      } catch (error) {
        // Handle race condition: account was connected to another user in parallel request
        if ((error as any).status === 409) {
          const currentAccount = await getOAuthAccountByProviderUserId(
            oauthAccount.provider,
            oauthAccount.account.provider_user_id,
          )
          if (currentAccount?.user_id) {
            const connectedUser = await getPrivateUserByAny(currentAccount.user_id)
            assert(connectedUser, 500, 'User not found for concurrently connected account')
            await ensureCurrentConsents(connectedUser.id)
            /* c8 ignore next -- lint-only fire-and-forget enqueue disposition. */
            void enqueueOnUserLoggedIn(connectedUser.id, loginContext)
            return connectedUser
          }
        }
        throw error
      }
      const user = await getPrivateUserByAny(existingUser.id)
      assert(user, 500, 'User not found after connecting oauth account')
      await ensureCurrentConsents(user.id)
      void enqueueOnUserUpdated(user.id)
      void enqueueOnUserLoggedIn(user.id, loginContext)
      return user
    }

    await ensureCurrentConsents(existingUser.id)
    void enqueueOnUserLoggedIn(existingUser.id, loginContext)
    return existingUser
  }

  const referrerId = sessionId ? await getReferrerIdForSession(sessionId) : null
  let newUser: PrivateUser
  try {
    newUser = await createUser({
      oauthAccount,
      emailAddress: effectiveEmailAddress,
      phoneNumber,
      referrerId,
    })
  } catch (error) {
    // Handle race condition: a concurrent request created the same email/phone user.
    // Wrap the refetch in its own try/catch so a validation error from getPrivateUserByAny
    // (e.g. 422 invalid identifier) does not mask the original USER_CREATION_RACE error.
    if ((error as { code?: string }).code === USER_CREATION_RACE) {
      const identifier = effectiveEmailAddress ?? phoneNumber
      if (identifier) {
        let racedUser: PrivateUser | null = null
        try {
          racedUser = await getPrivateUserByAny(identifier, { readOnly: false })
        } catch {
          // refetch failed — fall through to rethrow original error
        }
        if (racedUser) {
          await ensureCurrentConsents(racedUser.id)
          void enqueueOnUserLoggedIn(racedUser.id, loginContext)
          return racedUser
        }
      }
    }
    throw error
  }
  entityCacheBloomFilters.users.add([
    normalizeKey(newUser.id),
    ...(newUser.username ? [normalizeKey(newUser.username)] : []),
  ])
  if (referrerId) {
    await updateAttributionSignup(sessionId!, referrerId, newUser.id)
    void enqueueReferralSignupNotification(referrerId, newUser.id)
    void enqueueAutoFollowReferrer(newUser.id, referrerId)
  }
  if (effectiveEmailAddress || loginContext.oauth_provider) {
    void enqueueSendWelcomeEmail(
      {
        userId: newUser.id,
        uiLocale: newUser.ui_locale ?? null,
      },
      { userName: newUser.username ?? undefined, uiLocale: newUser.ui_locale ?? null },
    )
  }
  void enqueueOnUserCreated(newUser.id, loginContext)
  return newUser
}

async function ensureCurrentConsents(userId: string): Promise<void> {
  await Promise.all([
    ensureConsentVersion(userId, 'privacy_policy', PRIVACY_POLICY_VERSION),
    ensureConsentVersion(userId, 'terms_of_service', TERMS_OF_SERVICE_VERSION),
  ])
}
