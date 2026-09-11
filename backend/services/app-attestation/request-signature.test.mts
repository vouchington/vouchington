import {
  deleteDynamicConfigFieldsForTest,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import { randomBytes, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAppAttestRequestHeaders,
  type AppAttestRequestHeaders,
} from '@voucha/test-helpers/app-attestation-fabricator'
import { appAttestationConfig } from './config.mts'
import { verifyRequestSignature } from './request-signature.mts'

const NOW_SECONDS = 1_700_000_000

function headersToParams(
  h: AppAttestRequestHeaders,
  did: string,
  method = 'GET',
  path = '/api/v1/session',
  body = Buffer.alloc(0),
) {
  return {
    method,
    path,
    body,
    keyId: h['x-app-attest-key-id'],
    assertion: h['x-app-attest-assertion'],
    timestamp: h['x-app-attest-timestamp'],
    nonce: h['x-app-attest-nonce'],
    did,
  }
}

describe('verifyRequestSignature', () => {
  beforeEach(() => {
    vi.stubEnv('APPLE_APP_ATTEST_TEAM_ID', 'TESTTEAM1X')
    vi.stubEnv('APPLE_APP_ATTEST_BUNDLE_ID', 'io.voucha.test-fixture')
    vi.setSystemTime(NOW_SECONDS * 1000)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
    deleteDynamicConfigFieldsForTest(
      appAttestationConfig,
      Object.keys(appAttestationConfig.fieldTypes),
    )
  })

  it('verifies a valid per-request assertion', async () => {
    const did = randomUUID()
    const body = Buffer.from('{"title":"hello"}')
    const method = 'POST'
    const path = '/api/v1/posts'
    const h = await createAppAttestRequestHeaders({
      did,
      method,
      path,
      body,
      timestamp: NOW_SECONDS,
    })
    await expect(
      verifyRequestSignature(headersToParams(h, did, method, path, body)),
    ).resolves.toBeUndefined()
  })

  it('rejects when timestamp is too old', async () => {
    const did = randomUUID()
    const h = await createAppAttestRequestHeaders({
      did,
      method: 'GET',
      path: '/api/v1/session',
      timestamp: NOW_SECONDS - 400,
    })
    await expect(verifyRequestSignature(headersToParams(h, did))).rejects.toMatchObject({
      code: 'ATTESTATION_TIMESTAMP_INVALID',
    })
  })

  it('rejects when timestamp is in the far future', async () => {
    const did = randomUUID()
    const h = await createAppAttestRequestHeaders({
      did,
      method: 'GET',
      path: '/api/v1/session',
      timestamp: NOW_SECONDS + 400,
    })
    await expect(verifyRequestSignature(headersToParams(h, did))).rejects.toMatchObject({
      code: 'ATTESTATION_TIMESTAMP_INVALID',
    })
  })

  it('rejects a non-integer timestamp', async () => {
    const did = randomUUID()
    const h = await createAppAttestRequestHeaders({ did, method: 'GET', path: '/foo' })
    await expect(
      verifyRequestSignature({ ...headersToParams(h, did), timestamp: 'abc' }),
    ).rejects.toMatchObject({ code: 'ATTESTATION_TIMESTAMP_INVALID' })
  })

  it('rejects a replayed nonce', async () => {
    const did = randomUUID()
    const h = await createAppAttestRequestHeaders({ did, method: 'GET', path: '/api/v1/session' })
    const params = headersToParams(h, did)
    await verifyRequestSignature(params)
    await expect(verifyRequestSignature(params)).rejects.toMatchObject({
      code: 'ATTESTATION_NONCE_REPLAYED',
    })
  })

  it('rejects an assertion for an unknown keyId', async () => {
    await expect(
      verifyRequestSignature({
        method: 'GET',
        path: '/api/v1/session',
        body: Buffer.alloc(0),
        keyId: randomBytes(32).toString('base64'),
        assertion: Buffer.from('not-cbor').toString('base64'),
        timestamp: String(NOW_SECONDS),
        nonce: randomBytes(16).toString('hex'),
        did: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'ATTESTATION_REJECTED' })
  })

  it('rejects a valid assertion when the caller did does not match the attested did', async () => {
    const attestedDid = randomUUID()
    const callerDid = randomUUID()
    const h = await createAppAttestRequestHeaders({
      did: attestedDid,
      method: 'GET',
      path: '/api/v1/session',
    })
    await expect(verifyRequestSignature(headersToParams(h, callerDid))).rejects.toMatchObject({
      code: 'ATTESTATION_REJECTED',
    })
  })

  it('accepts development keys when development attestation is allowed', async () => {
    overrideDynamicConfigFieldsForTest(appAttestationConfig, {
      allow_development_attestation: true,
    })
    const did = randomUUID()
    const method = 'POST'
    const path = '/api/v1/posts'
    const h = await createAppAttestRequestHeaders({ did, method, path, environment: 'development' })
    await expect(
      verifyRequestSignature(headersToParams(h, did, method, path)),
    ).resolves.toBeUndefined()
  })
})
