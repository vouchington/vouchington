import { getPrivateUserByAny } from './get.mts'
import { getOAuthAccountByProviderUserId } from '@services/oauth-accounts'
import { isHttpError } from 'http-errors'
import assert from 'http-assert'
import {
  enqueueOnUserCreated,
  enqueueOnUserLoggedIn,
  enqueueAutoFollowReferrer,
} from '@queues/entity-listeners/enqueues'
import { enqueueReferralSignupNotification } from '@queues/notifications/enqueues'
import { enqueueSendWelcomeEmail } from '@queues/emails/enqueues'
import { getReferrerIdForSession, updateAttributionSignup } from '@services/attribution'
import { addEntityBloomKeys } from '@services/entity-cache/bloom-filter-repair'
import { normalizeKey } from '@ts-shared/utils/strings'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { OAUTH_ACCOUNT_EMAIL_CONFLICT, USER_CREATION_RACE } from '@modules/on-error/error-codes'
import type { PrivateUser, UpsertUserOptions } from './types.mts'
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
  sessionId,
}: UpsertUserOptions): Promise<PrivateUser> => {
  const effectiveEmailAddress = oauthAccount
    ? (oauthAccount.account.provider_user_email_address ?? undefined)
    : emailAddress

  const existingUser = await getUser({ oauthAccount, emailAddress, phoneNumber })
  if (existingUser) {
    await ensureCurrentConsents(existingUser.id)
    void enqueueOnUserLoggedIn(existingUser.id)
    return existingUser
  }

  if (oauthAccount && effectiveEmailAddress) {
    const emailUser = await getPrivateUserByAny(effectiveEmailAddress, { readOnly: false })
    if (emailUser) {
      throw createCodedError(
        409,
        'OAuth account email conflicts with an existing user',
        OAUTH_ACCOUNT_EMAIL_CONFLICT,
      )
    }
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
  } catch (err) {
    if (oauthAccount && isHttpError(err) && err.status === 409) {
      const currentAccount = await getOAuthAccountByProviderUserId(
        oauthAccount.provider,
        oauthAccount.account.provider_user_id,
      )
      if (currentAccount?.user_id) {
        const connectedUser = await getPrivateUserByAny(currentAccount.user_id, { readOnly: false })
        assert(connectedUser, 500, 'User not found for concurrently connected account')
        await ensureCurrentConsents(connectedUser.id)
        void enqueueOnUserLoggedIn(connectedUser.id)
        return connectedUser
      }
    }
    // Handle race condition: a concurrent request created the same email/phone user.
    // Wrap the refetch in its own try/catch so a validation error from getPrivateUserByAny
    // (e.g. 422 invalid identifier) does not mask the original USER_CREATION_RACE error.
    if (!oauthAccount && (err as { code?: string }).code === USER_CREATION_RACE) {
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
          void enqueueOnUserLoggedIn(racedUser.id)
          return racedUser
        }
      }
    }
    throw err
  }
  void addEntityBloomKeys('users', [
    normalizeKey(newUser.id),
    ...(newUser.username ? [normalizeKey(newUser.username)] : []),
  ])
  if (referrerId) {
    await updateAttributionSignup(sessionId!, referrerId, newUser.id)
    void enqueueReferralSignupNotification(referrerId, newUser.id)
    void enqueueAutoFollowReferrer(newUser.id, referrerId)
  }
  if (effectiveEmailAddress || oauthAccount) {
    void enqueueSendWelcomeEmail(
      {
        userId: newUser.id,
        uiLocale: newUser.ui_locale ?? null,
      },
      { userName: newUser.username ?? undefined, uiLocale: newUser.ui_locale ?? null },
    )
  }
  void enqueueOnUserCreated(newUser.id)
  return newUser
}

async function ensureCurrentConsents(userId: string): Promise<void> {
  await Promise.all([
    ensureConsentVersion(userId, 'privacy_policy', PRIVACY_POLICY_VERSION),
    ensureConsentVersion(userId, 'terms_of_service', TERMS_OF_SERVICE_VERSION),
  ])
}
