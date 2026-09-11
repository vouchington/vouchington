import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { createPublicKey, randomBytes, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyAssertion } from './assertion.mts'
import { storeAppAttestChallenge } from './challenges.mts'
import { appAttestationConfig } from './config.mts'
import { insertAttestationKey, loadAttestationKeyByKeyId } from './store.mts'
import type { AppAttestEnvironment } from './types.mts'

// Real assertion fixture hardcoded in node-app-attest's own test suite
// (test/verifyAssertion.test.js). Its authenticator data encodes a fixed sign count of 1,
// so it can verify successfully exactly once against a key whose stored sign_count is 0.
const BUNDLE_IDENTIFIER = 'io.uebelacker.AppAttestExample'
const TEAM_IDENTIFIER = 'V8H6LQ9448'
const FIXTURE_ASSERTION = Buffer.from(
  'omlzaWduYXR1cmVYRzBFAiBB8BGAwkmFCg1M5J0mOYEun0SUN1/lse79/7ypG9WiMQIhAIHvqj7eg59B1PMFX1CN4GMGlsgfFtdL30pHCf7G/dNRcWF1dGhlbnRpY2F0b3JEYXRhWCXKPdw7T3iujcFZbHVrHX0mDSMrNms5PzEbrFbQPRA6rEAAAAAB',
  'base64',
)
const FIXTURE_PUBLIC_KEY_PEM =
  '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEg69t2YzgcPTLUx8Zgu+rbcikeaEL\n8Ppb+HG0QTIulz8YUB9tgv1pDRruWk87nZC3our56pzIWaqXEbaWyamdzA==\n-----END PUBLIC KEY-----\n'
const FIXTURE_PAYLOAD =
  '{"subject":"Lorem ipsum","message":"Lorem ipsum dolor sit amet, consectetur adipiscing elit."}'
const FIXTURE_PUBLIC_KEY_DER = createPublicKey(FIXTURE_PUBLIC_KEY_PEM).export({
  type: 'spki',
  format: 'der',
})

function testChallengeKey(label: string): string {
  return `assertion-test-${label}-${randomUUID()}`
}

async function insertRandomAttestationKey(
  did: string,
  environment: AppAttestEnvironment = 'production',
): Promise<{ keyId: string; keyIdBuffer: Buffer }> {
  const keyIdBuffer = randomBytes(32)
  const keyId = keyIdBuffer.toString('base64')
  await insertAttestationKey({
    keyId: keyIdBuffer,
    did,
    publicKey: FIXTURE_PUBLIC_KEY_DER,
    bundleId: BUNDLE_IDENTIFIER,
    environment,
  })
  return { keyId, keyIdBuffer }
}

describe('verifyAssertion', () => {
  beforeEach(() => {
    vi.stubEnv('APPLE_APP_ATTEST_TEAM_ID', TEAM_IDENTIFIER)
    vi.stubEnv('APPLE_APP_ATTEST_BUNDLE_ID', BUNDLE_IDENTIFIER)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    deleteDynamicConfigFieldsForTest(
      appAttestationConfig,
      Object.keys(appAttestationConfig.fieldTypes),
    )
  })

  it('rejects an assertion from a development-environment key when development attestation is not allowed', async () => {
    const did = randomUUID()
    const { keyId } = await insertRandomAttestationKey(did, 'development')

    const challengeKey = testChallengeKey('development-disallowed')
    await storeAppAttestChallenge('assertion', challengeKey, 'unused-by-verifyAssertion')

    await expect(
      verifyAssertion({
        challengeKey,
        keyId,
        did,
        assertion: FIXTURE_ASSERTION,
        payload: FIXTURE_PAYLOAD,
      }),
    ).rejects.toMatchObject({ status: 403, code: 'ATTESTATION_REJECTED' })
  })

  it('verifies an assertion from a development-environment key when development attestation is allowed', async () => {
    overrideDynamicConfigFieldsForTest(appAttestationConfig, {
      allow_development_attestation: true,
    })
    const did = randomUUID()
    const { keyId } = await insertRandomAttestationKey(did, 'development')

    const challengeKey = testChallengeKey('development-allowed')
    await storeAppAttestChallenge('assertion', challengeKey, 'unused-by-verifyAssertion')

    const result = await verifyAssertion({
      challengeKey,
      keyId,
      did,
      assertion: FIXTURE_ASSERTION,
      payload: FIXTURE_PAYLOAD,
    })
    expect(result).toEqual({ keyId, signCount: 1 })
  })

  it('verifies an assertion, bumps sign_count, then rejects a sign-count regression on replay', async () => {
    const did = randomUUID()
    const { keyId, keyIdBuffer } = await insertRandomAttestationKey(did)

    const firstChallengeKey = testChallengeKey('success')
    await storeAppAttestChallenge('assertion', firstChallengeKey, 'unused-by-verifyAssertion')

    const result = await verifyAssertion({
      challengeKey: firstChallengeKey,
      keyId,
      did,
      assertion: FIXTURE_ASSERTION,
      payload: FIXTURE_PAYLOAD,
    })
    expect(result).toEqual({ keyId, signCount: 1 })

    const stored = await loadAttestationKeyByKeyId(keyIdBuffer)
    expect(stored?.sign_count).toBe(1)

    const secondChallengeKey = testChallengeKey('regression')
    await storeAppAttestChallenge('assertion', secondChallengeKey, 'unused-by-verifyAssertion')

    await expect(
      verifyAssertion({
        challengeKey: secondChallengeKey,
        keyId,
        did,
        assertion: FIXTURE_ASSERTION,
        payload: FIXTURE_PAYLOAD,
      }),
    ).rejects.toMatchObject({ status: 403, code: 'ATTESTATION_REJECTED' })
  })

  it('rejects an assertion for an unknown keyId', async () => {
    const challengeKey = testChallengeKey('unknown-key')
    await storeAppAttestChallenge('assertion', challengeKey, 'unused-by-verifyAssertion')

    const unknownKeyId = randomBytes(32).toString('base64')
    await expect(
      verifyAssertion({
        challengeKey,
        keyId: unknownKeyId,
        did: randomUUID(),
        assertion: FIXTURE_ASSERTION,
        payload: FIXTURE_PAYLOAD,
      }),
    ).rejects.toMatchObject({ status: 403, code: 'ATTESTATION_REJECTED' })
  })

  it('rejects when the assertion challenge is missing or expired', async () => {
    const unknownKeyId = randomBytes(32).toString('base64')
    await expect(
      verifyAssertion({
        challengeKey: testChallengeKey('missing-challenge'),
        keyId: unknownKeyId,
        did: randomUUID(),
        assertion: FIXTURE_ASSERTION,
        payload: FIXTURE_PAYLOAD,
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('rejects a cryptographically valid assertion when the caller did does not match the key that was attested', async () => {
    const { keyId } = await insertRandomAttestationKey(randomUUID())

    const challengeKey = testChallengeKey('did-mismatch')
    await storeAppAttestChallenge('assertion', challengeKey, 'unused-by-verifyAssertion')

    await expect(
      verifyAssertion({
        challengeKey,
        keyId,
        // A different did than the one the key was attested under -- this is the signing-oracle
        // gap: a valid signature from a device bound to someone else's session.
        did: randomUUID(),
        assertion: FIXTURE_ASSERTION,
        payload: FIXTURE_PAYLOAD,
      }),
    ).rejects.toMatchObject({ status: 403, code: 'ATTESTATION_REJECTED' })
  })
})
