import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { getAndDelete } from '@data-stores/valkey/idempotency-key'
import { TimeUnit } from '@valkey/valkey-glide'
// Canonical definition lives in @voucha/types/entities/app-attestation — re-exported here for
// call-site stability across the existing @services/app-attestation importers.
import type { AppAttestChallengeType } from '@voucha/types/entities/app-attestation'

export type { AppAttestChallengeType }

const CHALLENGE_TTL_SECONDS = 300 // 5 minutes
const KEY_PREFIX = 'app-attest-challenge'

export async function storeAppAttestChallenge(
  type: AppAttestChallengeType,
  key: string,
  challenge: string,
): Promise<void> {
  await sessionValkeyClient.set(`${KEY_PREFIX}:${type}:${key}`, challenge, {
    expiry: { type: TimeUnit.Seconds, count: CHALLENGE_TTL_SECONDS },
  })
}

export async function getAndDeleteAppAttestChallenge(
  type: AppAttestChallengeType,
  key: string,
): Promise<string | null> {
  return await getAndDelete(`${KEY_PREFIX}:${type}:${key}`, {
    client: sessionValkeyClient,
  })
}
