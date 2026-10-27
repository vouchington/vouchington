import { getTrustedClientJa4 } from '@modules/request-client-info/cloudflare-signals'
import { verifyDeviceJwt } from '@ts-shared/session-jwt'
import {
  getCachedBootstrapDeviceId,
  getCachedVerifiedDeviceToken,
} from '@modules/request-client-info'
import { markVerifiedSessionCredential } from '@modules/request-client-info/session-credential'
import type { Application, Context } from '@jongleberry/api-server'
import {
  createDeviceAndSessionTokens,
  assertSessionClientBinding,
  isSessionClientBindingError,
  isSessionRevoked,
  verifyDeviceAndSessionTokens,
  resolveRequestSessionClaims,
  type DeviceTokenPayload,
  type VerifyDeviceAndSessionTokenResult,
} from '@services/jwt-session'
import { setAuthenticationCookies, clearAuthenticationCookies } from '@modules/api-utils'
import { loadCurrentUser } from './current-user.mts'
import { v7 } from 'uuid'
import type { PrivateUser } from '@services/users/types'
import { getPrivateUserByAny } from '@services/users/get'

declare module '@jongleberry/api-server' {
  interface Context {
    getDeviceTokenData(dt?: string): Promise<DeviceTokenPayload | { did: string }>
    getSessionTokenData(
      st?: string,
      dt?: string,
    ): Promise<VerifyDeviceAndSessionTokenResult | { did: string; sid: string; uid: null }>
    getCurrentUser(): Promise<PrivateUser | null>
    currentUser?: PrivateUser | null
    currentUserPromise?: Promise<PrivateUser | null>
    deviceTokenData?: DeviceTokenPayload | { did: string }
    deviceTokenDataKey?: string
    deviceTokenDataPromise?: Promise<DeviceTokenPayload | { did: string }>
    sessionTokenData?: VerifyDeviceAndSessionTokenResult | { did: string; sid: string; uid: null }
    sessionTokenDataKey?: string
    sessionTokenDataPromise?: Promise<
      VerifyDeviceAndSessionTokenResult | { did: string; sid: string; uid: null }
    >
  }
}

const MISSING_DEVICE_TOKEN_KEY = '__missing-device-token__'
const MISSING_SESSION_TOKEN_KEY = '__missing-session-token__'

const extensions = {
  async getDeviceTokenData(this: Context, dt?: string) {
    const deviceToken = dt || this.cookies.get('dt')
    const deviceTokenKey = deviceToken || MISSING_DEVICE_TOKEN_KEY

    if (this.deviceTokenDataKey === deviceTokenKey && this.deviceTokenData) {
      return this.deviceTokenData
    }

    if (this.deviceTokenDataKey === deviceTokenKey && this.deviceTokenDataPromise) {
      return this.deviceTokenDataPromise
    }

    this.deviceTokenDataKey = deviceTokenKey
    this.deviceTokenDataPromise = (async () => {
      if (!deviceToken) {
        const payload = { did: getCachedBootstrapDeviceId(this.req) ?? v7() }
        this.deviceTokenData = payload
        return payload
      }

      const payload =
        getCachedVerifiedDeviceToken(this.req, deviceToken) ?? (await verifyDeviceJwt(deviceToken))
      this.deviceTokenData = payload ?? { did: getCachedBootstrapDeviceId(this.req) ?? v7() }
      return this.deviceTokenData
    })()

    try {
      return await this.deviceTokenDataPromise
    } finally {
      this.deviceTokenDataPromise = undefined
    }
  },

  async getSessionTokenData(this: Context, st?: string, dt?: string) {
    const sessionToken = st || this.cookies.get('st')
    const deviceToken = dt || this.cookies.get('dt')
    const sessionTokenKey = `${deviceToken || MISSING_DEVICE_TOKEN_KEY}:${sessionToken || MISSING_SESSION_TOKEN_KEY}`

    if (this.sessionTokenDataKey === sessionTokenKey && this.sessionTokenData) {
      return this.sessionTokenData
    }

    if (this.sessionTokenDataKey === sessionTokenKey && this.sessionTokenDataPromise) {
      return this.sessionTokenDataPromise
    }

    this.sessionTokenDataKey = sessionTokenKey
    this.sessionTokenDataPromise = (async () => {
      const deviceData = await this.getDeviceTokenData(deviceToken)

      if (!sessionToken || !deviceToken) {
        this.sessionTokenData = { did: deviceData.did, sid: v7(), uid: null }
        return this.sessionTokenData
      }

      const result = await verifyDeviceAndSessionTokens({ deviceToken, sessionToken })
      if (result) {
        try {
          assertSessionClientBinding(
            result,
            this.req.headers['user-agent'],
            getTrustedClientJa4(this.req),
          )
        } catch (err) {
          if (!isSessionClientBindingError(err)) throw err
          clearAuthenticationCookies(this)
          this.sessionTokenData = { did: deviceData.did, sid: v7(), uid: null }
          return this.sessionTokenData
        }
        markVerifiedSessionCredential(this.req)
        if (
          result.uid &&
          (await isSessionRevoked(result.sid, {
            userId: result.uid,
            deviceId: result.did,
            issuedAt: result.device_iat,
            mfaVerifiedAt: result.mfa_at ?? null,
          }))
        ) {
          const tokens = await createDeviceAndSessionTokens({
            did: result.did,
            eventType: 'refreshed_anonymous',
            deviceClass: result.dc,
          })
          setAuthenticationCookies(this, {
            dt: tokens.deviceToken.token,
            st: tokens.sessionToken.token,
            deviceClass: tokens.deviceToken.payload.dc,
          })
          this.sessionTokenData = {
            ...tokens.sessionToken.payload,
            dc: tokens.deviceToken.payload.dc,
          }
          return this.sessionTokenData
        }

        if (result.uid) {
          const inboundIdentity =
            deviceToken === this.cookies.get('dt') && sessionToken === this.cookies.get('st')
          const resolved = await resolveRequestSessionClaims(result, userId => {
            if (inboundIdentity && this.currentUser !== undefined)
              return Promise.resolve(this.currentUser)
            return getPrivateUserByAny(userId, { readOnly: false })
          })
          if (inboundIdentity && resolved.user !== undefined) this.currentUser = resolved.user
          if (!resolved.session) {
            clearAuthenticationCookies(this)
            this.sessionTokenData = { did: deviceData.did, sid: v7(), uid: null }
            return this.sessionTokenData
          }
          this.sessionTokenData = resolved.session
          return resolved.session
        }
        this.sessionTokenData = result
        return result
      }

      this.sessionTokenData = { did: deviceData.did, sid: v7(), uid: null }
      return this.sessionTokenData
    })()

    try {
      return await this.sessionTokenDataPromise
    } finally {
      this.sessionTokenDataPromise = undefined
    }
  },

  async getCurrentUser(this: Context) {
    return loadCurrentUser(this)
  },
}

export default function applyContext(app: Application): void {
  app.extend(extensions)
}
