import { createStringPasskeys } from '@vouchington/auth'
import { RateLimiter } from '@data-stores/valkey-rate-limiter'
import onError from '@modules/on-error'
import { createPasskey } from './create.mts'
import { getAndDeleteChallenge, storeChallenge } from './challenges.mts'
import { RP_ID, RP_NAME } from './config.mts'
import { getPasskeyByCredentialId, getPasskeyCredentialIdsByUserId } from './get.mts'
import type { PublicPasskey } from './types.mts'
import { updatePasskeyCounter } from './update.mts'

const discoverablePasskeyVerifyFailedRateLimiter = new RateLimiter({
  prefix: 'discoverable-passkey-verify-failed',
  ttlSeconds: 60,
})

export const passkeyProtocol = createStringPasskeys<string, PublicPasskey, string>({
  rpId: RP_ID,
  rpName: RP_NAME,
  challengeTtlSeconds: 300,
  timeoutMs: 60_000,
  state: { put: storeChallenge, consume: getAndDeleteChallenge },
  repository: {
    listCredentialIds: getPasskeyCredentialIdsByUserId,
    findByCredentialId: getPasskeyByCredentialId,
    /* v8 ignore next -- successful registration requires a real authenticator ceremony */
    create: ({ userId, registration, context }) => createPasskey(userId, registration, context),
    updateCounter: updatePasskeyCounter,
  },
  attestationType: 'none',
  authenticatorAttachment: null,
  supportedAlgorithmIDs: [-8, -7, -257],
  residentKey: 'preferred',
  keys: {
    registration: (userId, deviceId) => `passkey-reg:${userId}:${deviceId}`,
    authentication: (userId, deviceId) => `passkey-auth:${userId}:${deviceId}`,
    discoverableAuthentication: deviceId => `passkey-discoverable-auth:${deviceId}`,
  },
  failureLimiter: {
    reserve: async failure => {
      if (failure.mode !== 'discoverable') return true
      try {
        const result = await discoverablePasskeyVerifyFailedRateLimiter.addAndCheck(
          [failure.deviceId],
          7,
        )
        return !result.limited
      } catch (error) /* v8 ignore next 2 -- Valkey outage path fails open */ {
        onError(error instanceof Error ? error : new Error(String(error)))
        return true
      }
    },
  },
  userVerification: {
    registration: 'preferred',
    authentication: 'preferred',
    discoverableAuthentication: 'required',
  },
})
