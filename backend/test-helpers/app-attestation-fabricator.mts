import { createHash, createSign, generateKeyPairSync, randomBytes } from 'node:crypto'
import type { AppAttestEnvironment } from '@voucha/types/entities/app-attestation'
import {
  TEST_APP_ATTEST_TEAM_ID,
  TEST_APP_ATTEST_BUNDLE_ID,
  insertAttestationKey,
} from './app-attestation.mts'

// Duplicated from backend/services/app-attestation/request-canonical.mts — pure functions with
// zero dependencies beyond node:crypto.
export const EMPTY_BODY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

export function sha256Hex(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

export function buildCanonicalRequestString(
  method: string,
  path: string,
  bodySha256Hex: string,
  timestamp: string,
  nonce: string,
): string {
  return ['VOUCHA-REQSIG-v1', method.toUpperCase(), path, bodySha256Hex, timestamp, nonce].join(
    '\n',
  )
}

export type AppAttestRequestHeaders = {
  'x-app-attest-key-id': string
  'x-app-attest-assertion': string
  'x-app-attest-timestamp': string
  'x-app-attest-nonce': string
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

/**
 * Create an App Attest per-request assertion for testing.
 * Inserts a fresh EC P-256 key into the DB under `params.did`, builds the canonical
 * request string, signs it, and returns the four x-app-attest-* headers.
 */
export async function createAppAttestRequestHeaders(params: {
  did: string
  method: string
  path: string
  body?: Buffer | string
  timestamp?: number
  signCount?: number
  teamId?: string
  bundleId?: string
  environment?: AppAttestEnvironment
}): Promise<AppAttestRequestHeaders> {
  const teamId = params.teamId ?? TEST_APP_ATTEST_TEAM_ID
  const bundleId = params.bundleId ?? TEST_APP_ATTEST_BUNDLE_ID
  const signCount = params.signCount ?? 1
  const environment = params.environment ?? 'production'
  const timestamp = params.timestamp ?? Math.floor(Date.now() / 1000)
  const nonce = randomBytes(16).toString('hex')

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

  const body = params.body ?? Buffer.alloc(0)
  const bodySha256Hex = Buffer.isBuffer(body)
    ? sha256Hex(body)
    : body === ''
      ? EMPTY_BODY_SHA256
      : sha256Hex(body)
  const canonical = buildCanonicalRequestString(
    params.method.toUpperCase(),
    params.path,
    bodySha256Hex,
    String(timestamp),
    nonce,
  )

  const authenticatorData = buildAuthenticatorData(teamId, bundleId, signCount)
  const clientDataHash = createHash('sha256').update(canonical).digest()
  const assertionNonce = createHash('sha256')
    .update(Buffer.concat([authenticatorData, clientDataHash]))
    .digest()

  const signer = createSign('SHA256')
  signer.update(assertionNonce)
  signer.end()
  const signature = signer.sign(privateKey)

  const assertion = encodeAssertionCbor(signature, authenticatorData)

  return {
    'x-app-attest-key-id': keyId,
    'x-app-attest-assertion': assertion.toString('base64'),
    'x-app-attest-timestamp': String(timestamp),
    'x-app-attest-nonce': nonce,
  }
}
