import {
  EDGE_ANON_SESSION_JWT_ISSUER,
  verifyDeviceJwt,
  verifySessionJwt,
} from '@ts-shared/session-jwt'
import { isDeployedEnvironment } from '@ts-shared/deploy-environment'
import { decodeJwt } from 'jose'
import type { VerifyDeviceAndSessionTokenResult } from './types.mts'

let edgeAnonPublicKeysMissingLogged = false

// Combined function to verify both device and session tokens (signature-only, no Valkey)
export async function verifyDeviceAndSessionTokens({
  deviceToken,
  sessionToken,
}: {
  deviceToken: string
  sessionToken: string
}): Promise<VerifyDeviceAndSessionTokenResult | false> {
  const sessionIssuer = decodeSessionIssuer(sessionToken)
  if (sessionIssuer === EDGE_ANON_SESSION_JWT_ISSUER) {
    return verifyEdgeAnonymousDeviceAndSessionTokens({ deviceToken, sessionToken })
  }
  if (sessionIssuer === null) return false

  return verifyDeviceAndSessionTokensWithOptions({ deviceToken, sessionToken })
}

async function verifyDeviceAndSessionTokensWithOptions({
  deviceToken,
  sessionToken,
  issuer,
  env,
}: {
  deviceToken: string
  sessionToken: string
  issuer?: string
  env?: {
    VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64?: string
    VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64?: string
  }
}): Promise<VerifyDeviceAndSessionTokenResult | false> {
  try {
    const [devicePayload, sessionPayload] = await Promise.all([
      verifyDeviceJwt(deviceToken, { issuer, env }),
      verifySessionJwt(sessionToken, { issuer, env }),
    ])

    if (!devicePayload || !sessionPayload) {
      return false
    }

    // Device IDs from both tokens must match
    if (devicePayload.did !== sessionPayload.did) {
      return false
    }

    if (
      sessionPayload.uid &&
      (!sessionPayload.client ||
        typeof sessionPayload.iat !== 'number' ||
        typeof sessionPayload.exp !== 'number' ||
        typeof devicePayload.iat !== 'number' ||
        typeof devicePayload.exp !== 'number' ||
        devicePayload.client !== sessionPayload.client ||
        (sessionPayload.client === 'web' &&
          (!sessionPayload.ua_hash ||
            devicePayload.ua_hash !== sessionPayload.ua_hash ||
            devicePayload.refresh_uid !== sessionPayload.uid ||
            devicePayload.refresh_sid !== sessionPayload.sid)))
    )
      return false

    const membershipEntitlementExpired =
      sessionPayload.mpe !== undefined && Math.floor(Date.now() / 1000) >= sessionPayload.mpe

    return {
      did: sessionPayload.did,
      sid: sessionPayload.sid,
      uid: sessionPayload.uid,
      client: sessionPayload.client,
      ua_hash: sessionPayload.ua_hash,
      exp: sessionPayload.exp,
      device_exp: devicePayload.exp,
      device_iat: devicePayload.iat,
      iat: sessionPayload.iat,
      rol: sessionPayload.rol,
      mpl: membershipEntitlementExpired ? null : sessionPayload.mpl,
      mpe: sessionPayload.mpe,
      tt: membershipEntitlementExpired ? undefined : sessionPayload.tt,
      uil: sessionPayload.uil,
      rca: sessionPayload.rca,
      sca: sessionPayload.sca,
      dc: devicePayload.dc,
    }
  } catch {
    return false
  }
}

async function verifyEdgeAnonymousDeviceAndSessionTokens({
  deviceToken,
  sessionToken,
}: {
  deviceToken: string
  sessionToken: string
}): Promise<VerifyDeviceAndSessionTokenResult | false> {
  const edgePublicKeys = process.env.VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64
  const legacyPublicKeys = process.env.VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64
  if (!edgePublicKeys && !legacyPublicKeys && isDeployedEnvironment()) {
    logMissingEdgeAnonPublicKeys(sessionToken)
  }
  const publicKeyCandidates = [edgePublicKeys, legacyPublicKeys].filter((keys): keys is string =>
    Boolean(keys),
  )
  if (publicKeyCandidates.length === 0) {
    const verified = await verifyDeviceAndSessionTokensWithOptions({
      deviceToken,
      sessionToken,
      issuer: EDGE_ANON_SESSION_JWT_ISSUER,
    })
    return verifiedEdgeAnonymousSessionOrFalse(verified)
  }

  return verifyEdgeAnonymousDeviceAndSessionTokensWithCandidates({
    deviceToken,
    sessionToken,
    publicKeyCandidates,
    index: 0,
  })
}

async function verifyEdgeAnonymousDeviceAndSessionTokensWithCandidates({
  deviceToken,
  sessionToken,
  publicKeyCandidates,
  index,
}: {
  deviceToken: string
  sessionToken: string
  publicKeyCandidates: string[]
  index: number
}): Promise<VerifyDeviceAndSessionTokenResult | false> {
  const publicKeys = publicKeyCandidates[index]
  if (!publicKeys) return false

  const verified = await verifyDeviceAndSessionTokensWithOptions({
    deviceToken,
    sessionToken,
    issuer: EDGE_ANON_SESSION_JWT_ISSUER,
    env: {
      VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: publicKeys,
    },
  })

  const anonymousVerified = verifiedEdgeAnonymousSessionOrFalse(verified)
  if (anonymousVerified) return anonymousVerified
  if (verified) return false

  return verifyEdgeAnonymousDeviceAndSessionTokensWithCandidates({
    deviceToken,
    sessionToken,
    publicKeyCandidates,
    index: index + 1,
  })
}

function verifiedEdgeAnonymousSessionOrFalse(
  verified: VerifyDeviceAndSessionTokenResult | false,
): VerifyDeviceAndSessionTokenResult | false {
  return verified && verified.uid === null ? verified : false
}

function logMissingEdgeAnonPublicKeys(sessionToken: string): void {
  if (edgeAnonPublicKeysMissingLogged) return

  try {
    if (decodeJwt(sessionToken).iss !== EDGE_ANON_SESSION_JWT_ISSUER) return
  } catch {
    return
  }

  console.error(
    'VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64 is not set; edge-anon session tokens cannot be verified. Set the edge-anon public key env before enabling worker edge-anon minting.',
  )
  edgeAnonPublicKeysMissingLogged = true
}

function decodeSessionIssuer(sessionToken: string): string | undefined | null {
  try {
    return decodeJwt(sessionToken).iss
  } catch {
    return null
  }
}
