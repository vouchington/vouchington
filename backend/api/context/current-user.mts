import type { Context } from '@jongleberry/api-server'
import { setAuthenticationCookies } from '@modules/api-utils'
import { getPrivateUserByAny } from '@services/users/get'
import type { PrivateUser } from '@services/users/types'
import { createDeviceAndSessionTokens, getSessionAuthorizedUser } from '@services/jwt-session'
import { setRequestCurrentUser } from './request-context.mts'

/** Memoized primary read of the acting user. Fills the request store and does not authenticate. */
export async function loadCurrentUser(context: Context): Promise<PrivateUser | null> {
  if (context.currentUser !== undefined) {
    setRequestCurrentUser(context.currentUser)
    return context.currentUser
  }
  if (context.currentUserPromise) {
    const user = await context.currentUserPromise
    setRequestCurrentUser(user)
    return user
  }
  context.currentUserPromise = readCurrentUser(context)
  try {
    const user = await context.currentUserPromise
    setRequestCurrentUser(user)
    return user
  } finally {
    context.currentUserPromise = undefined
  }
}

async function readCurrentUser(context: Context): Promise<PrivateUser | null> {
  const sessionData = await context.getSessionTokenData()
  if (context.currentUser !== undefined) return context.currentUser
  if (!sessionData.uid) {
    context.currentUser = null
    return null
  }
  const user = await getPrivateUserByAny(sessionData.uid, { readOnly: false })
  if (!user) {
    await resetDeletedUserSession(context, sessionData.did)
    context.currentUser = null
    return null
  }
  const authorized = getSessionAuthorizedUser(user, {
    mfaVerifiedAt: 'mfa_at' in sessionData ? sessionData.mfa_at : undefined,
  })
  context.currentUser = authorized
  return authorized
}

async function resetDeletedUserSession(context: Context, deviceId: string): Promise<void> {
  const deviceData = await context.getDeviceTokenData()
  const deviceClass = 'dc' in deviceData ? deviceData.dc : undefined
  const { deviceToken, sessionToken } = await createDeviceAndSessionTokens({
    did: deviceId,
    deviceClass,
  })
  setAuthenticationCookies(context, {
    dt: deviceToken.token,
    st: sessionToken.token,
    deviceClass,
  })
}
