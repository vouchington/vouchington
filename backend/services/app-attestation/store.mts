import { write } from '@data-stores/psql'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { ATTESTATION_REJECTED } from '@modules/on-error/error-codes'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { AppAttestEnvironment } from './types.mts'

export type StoredAttestationKey = {
  id: string
  key_id: Buffer
  did: string
  public_key: Buffer
  sign_count: number
  bundle_id: string
  environment: AppAttestEnvironment
}

export async function loadAttestationKeyByKeyId(
  keyId: Buffer,
): Promise<StoredAttestationKey | null> {
  // Auth-critical lookup: must be strongly consistent, or a device attested moments ago via
  // the write pool can look unknown on the read-replica pool and fail every subsequent request.
  const { rows } = await write(
    sql`/* loadAttestationKeyByKeyId */ SELECT id, key_id, did, public_key, sign_count, bundle_id, environment
        FROM app_attestation_keys
        WHERE key_id = ${keyId}`,
  )
  const row = rows[0] as StoredAttestationKey | undefined
  if (!row) return null
  return { ...row, sign_count: Number(row.sign_count) }
}

export async function insertAttestationKey(params: {
  keyId: Buffer
  did: string
  publicKey: Buffer
  bundleId: string
  environment: AppAttestEnvironment
}): Promise<void> {
  const { rowCount } = await write(
    sql`/* insertAttestationKey */ INSERT INTO app_attestation_keys (key_id, did, public_key, bundle_id, environment)
        VALUES (${params.keyId}, ${params.did}, ${params.publicKey}, ${params.bundleId}, ${params.environment})
        ON CONFLICT (key_id) DO NOTHING`,
  )
  assert(rowCount === 1, 409, 'App Attest key already registered')
}

export async function bumpAttestationSignCount(keyId: Buffer, newSignCount: number): Promise<void> {
  const { rowCount } = await write(
    sql`/* bumpAttestationSignCount */ UPDATE app_attestation_keys
        SET sign_count = ${newSignCount}, last_used_at = now()
        WHERE key_id = ${keyId} AND sign_count < ${newSignCount}`,
  )
  if (rowCount !== 1) {
    throw createCodedError(409, 'App Attest sign count regression', ATTESTATION_REJECTED)
  }
}
