import { createHash, createSign, generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, vi } from 'vitest'
import { write } from '@data-stores/psql'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { TimeUnit } from '@valkey/valkey-glide'
import sql from 'sql-template-strings'
import type {
  AppAttestChallengeType,
  AppAttestEnvironment,
} from '@voucha/types/entities/app-attestation'
import { appAttestationConfig } from '../services/app-attestation/index.mts'
import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from './dynamic-config.mts'

export const TEST_APP_ATTEST_TEAM_ID = 'TESTTEAM1X'
export const TEST_APP_ATTEST_BUNDLE_ID = 'io.voucha.test-fixture'

// Stubs the App Attest team/bundle env vars and enables `require_attestation_for_bypass` before
// each test in the describe block, and restores appAttestationConfig's dynamic fields after each
// one. Shared by every route's "App Attest bypass" test group (post creation, email-address
// tokens, ...): a route accepts a valid App Attest assertion in place of a CAPTCHA token only
// when this bypass is configured on.
export function useAppAttestBypassConfig(): void {
  beforeEach(() => {
    vi.stubEnv('APPLE_APP_ATTEST_TEAM_ID', TEST_APP_ATTEST_TEAM_ID)
    vi.stubEnv('APPLE_APP_ATTEST_BUNDLE_ID', TEST_APP_ATTEST_BUNDLE_ID)
    overrideDynamicConfigFieldsForTest(appAttestationConfig, { enabled: true })
    overrideDynamicConfigFieldsForTest(appAttestationConfig, {
      require_attestation_for_bypass: true,
    })
  })

  afterEach(() => {
    deleteDynamicConfigFieldsForTest(
      appAttestationConfig,
      Object.keys(appAttestationConfig.fieldTypes),
    )
  })
}

// Must stay in sync with backend/services/app-attestation/challenges.mts (key prefix and TTL
// are runtime configuration, not types, so they aren't relocatable to @voucha/types).
const TEST_APP_ATTEST_CHALLENGE_KEY_PREFIX = 'app-attest-challenge'
const TEST_APP_ATTEST_CHALLENGE_TTL_SECONDS = 300 // 5 minutes

async function storeAppAttestChallenge(
  type: AppAttestChallengeType,
  key: string,
  challenge: string,
): Promise<void> {
  await sessionValkeyClient.set(
    `${TEST_APP_ATTEST_CHALLENGE_KEY_PREFIX}:${type}:${key}`,
    challenge,
    {
      expiry: { type: TimeUnit.Seconds, count: TEST_APP_ATTEST_CHALLENGE_TTL_SECONDS },
    },
  )
}

// Duplicated from backend/services/app-attestation/store.mts insertAttestationKey — a thin
// single-table insert with no meaningful side effects beyond the write itself.
export async function insertAttestationKey(params: {
  keyId: Buffer
  did: string
  publicKey: Buffer
  bundleId: string
  environment: AppAttestEnvironment
}): Promise<void> {
  const { rowCount } = await write(
    sql`/* insertAttestationKey (test-helpers) */ INSERT INTO app_attestation_keys (key_id, did, public_key, bundle_id, environment)
        VALUES (${params.keyId}, ${params.did}, ${params.publicKey}, ${params.bundleId}, ${params.environment})
        ON CONFLICT (key_id) DO NOTHING`,
  )
  if (rowCount !== 1) {
    throw new Error('App Attest key already registered')
  }
}

export type AppAttestAssertionHeaders = {
  'x-app-attest-key-id': string
  'x-app-attest-assertion': string
  'x-app-attest-challenge-id': string
}

function cborTextString(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8')
  if (bytes.length > 23) throw new Error('cborTextString: fixture strings must be <= 23 bytes')
  return Buffer.concat([Buffer.from([0x60 + bytes.length]), bytes])
}

function cborByteString(value: Buffer): Buffer {
  if (value.length <= 23) return Buffer.concat([Buffer.from([0x40 + value.length]), value])
  if (value.length <= 255) return Buffer.concat([Buffer.from([0x58, value.length]), value])
  throw new Error('cborByteString: fixture byte strings must be <= 255 bytes')
}

function encodeAssertionCbor(signature: Buffer, authenticatorData: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from([0xa2]),
    cborTextString('signature'),
    cborByteString(signature),
    cborTextString('authenticatorData'),
    cborByteString(authenticatorData),
  ])
}

function buildAuthenticatorData(teamId: string, bundleId: string, signCount: number): Buffer {
  const rpIdHash = createHash('sha256').update(`${teamId}.${bundleId}`).digest()
  const flags = Buffer.from([0x00])
  const signCountBuffer = Buffer.alloc(4)
  signCountBuffer.writeUInt32BE(signCount, 0)
  return Buffer.concat([rpIdHash, flags, signCountBuffer])
}

export async function createAppAttestAssertionHeaders(params: {
  /**
   * The `did` the caller's request will present (e.g. via its `dt` cookie). The attestation
   * key is inserted bound to this exact `did` — `verifyAssertion` rejects a valid signature if
   * the caller's current `did` doesn't match, so this must be required, not defaulted, to force
   * every call site to think about which device identity the request will actually carry.
   */
  did: string
  actionTag: string
  challengeId?: string
  signCount?: number
  teamId?: string
  bundleId?: string
  environment?: AppAttestEnvironment
}): Promise<AppAttestAssertionHeaders> {
  const teamId = params.teamId ?? TEST_APP_ATTEST_TEAM_ID
  const bundleId = params.bundleId ?? TEST_APP_ATTEST_BUNDLE_ID
  const challengeId = params.challengeId ?? `test-app-attest-${randomUUID()}`
  const signCount = params.signCount ?? 1
  const environment = params.environment ?? 'production'

  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' })
  const keyIdBuffer = randomBytes(32)
  const keyId = keyIdBuffer.toString('base64')

  await insertAttestationKey({
    keyId: keyIdBuffer,
    did: params.did,
    publicKey: publicKeyDer,
    bundleId,
    environment,
  })
  await storeAppAttestChallenge('assertion', challengeId, 'unused-by-verifyAssertion')

  const payload = `${challengeId}:${params.actionTag}`
  const authenticatorData = buildAuthenticatorData(teamId, bundleId, signCount)
  const clientDataHash = createHash('sha256').update(payload).digest()
  const nonce = createHash('sha256')
    .update(Buffer.concat([authenticatorData, clientDataHash]))
    .digest()

  const signer = createSign('SHA256')
  signer.update(nonce)
  signer.end()
  const signature = signer.sign(privateKey)

  const assertion = encodeAssertionCbor(signature, authenticatorData)

  return {
    'x-app-attest-key-id': keyId,
    'x-app-attest-assertion': assertion.toString('base64'),
    'x-app-attest-challenge-id': challengeId,
  }
}
