import {
  readScopedCopyrightKeyId,
  resolveCopyrightEncryptionOwner,
} from './encryption-key-owners.mts'
import { randomBytes } from 'node:crypto'
import {
  PreparedCopyrightEncryptionKey,
  ScopedCopyrightSecrets,
  type CopyrightEncryptionOwner,
  type CopyrightEncryptionSubject,
} from './encryption-key-capabilities.mts'
export {
  PreparedCopyrightEncryptionKey,
  ScopedCopyrightSecrets,
  type CopyrightEncryptionOwner,
  type CopyrightEncryptionSubject,
} from './encryption-key-capabilities.mts'
import { beginTransaction, read } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  putCopyrightEncryptionKeyObject,
  readCopyrightEncryptionKeyObject,
} from './encryption-key-objects.mts'

/** Run before the caller opens its producer transaction; reservation commits before object PUT. */
export async function prepareCopyrightEncryptionKey(
  kind: CopyrightEncryptionOwner['kind'],
): Promise<PreparedCopyrightEncryptionKey> {
  const id = await reserveKey(kind)
  const key = randomBytes(32)
  try {
    // A stalled PUT cannot race the orphan sweeper and recreate an untracked key object.
    await using upload = await beginTransaction()
    const { rows } = await upload(sql`/* lockCopyrightEncryptionKeyUpload */
      SELECT id FROM copyright_retention_keys WHERE id = ${id} AND destroyed_at IS NULL FOR UPDATE`)
    if (!rows[0]) throw new Error('Copyright encryption key reservation expired')
    await putCopyrightEncryptionKeyObject(id, key)
    await upload(sql`/* completeCopyrightEncryptionKeyUpload */
      UPDATE copyright_retention_keys SET object_created_at = clock_timestamp() WHERE id = ${id}`)
    await upload.commit()
    return new PreparedCopyrightEncryptionKey(id, kind, key)
  } catch (err) {
    key.fill(0)
    throw err
  }
}

async function reserveKey(kind: CopyrightEncryptionOwner['kind']): Promise<string> {
  await using query = await beginTransaction()
  const { rows } = await query<{ id: string }>(sql`/* reserveCopyrightEncryptionKey */
    INSERT INTO copyright_retention_keys (owner_kind) VALUES (${kind}::copyright_encryption_owner_kinds) RETURNING id`)
  const id = rows[0]?.id
  if (!id) throw new Error('Copyright encryption key reservation is missing')
  await query.commit()
  return id
}

/** Deferred owner FK lets the same transaction attach the prepared key before inserting its owner. */
export async function attachCopyrightEncryptionKey(
  prepared: PreparedCopyrightEncryptionKey,
  owner: CopyrightEncryptionOwner,
  query: TransactionQuery,
): Promise<void> {
  await prepared.attach(owner, query)
}

export async function openCopyrightSecrets(
  subject: CopyrightEncryptionSubject,
  transaction?: TransactionQuery,
  access: 'read' | 'write' = 'read',
): Promise<ScopedCopyrightSecrets> {
  const ownedQuery = transaction ? undefined : await beginTransaction()
  const query = transaction ?? ownedQuery!
  try {
    // ast-grep-ignore: no-three-sequential-awaits -- Resolve the FK owner, lock its live key mapping, then fetch that exact authoritative key object while retaining the lifetime scope.
    const owner = await resolveCopyrightEncryptionOwner(subject, query)
    const id = await readScopedCopyrightKeyId(owner, query, access === 'write')
    const key = await readCopyrightEncryptionKeyObject(id)
    return new ScopedCopyrightSecrets(id, key, owner, ownedQuery)
  } catch (err) {
    if (ownedQuery) await ownedQuery[Symbol.asyncDispose]()
    throw err
  }
}

/** Parsing is the first encrypted intake write; prepare before entering its transaction. */
export async function prepareCopyrightIntakeEncryptionKey(
  intakeId: string,
): Promise<PreparedCopyrightEncryptionKey | null> {
  const { rows } = await read(sql`/* readCopyrightIntakeKeyAttachment */
    SELECT copyright_retention_key_id FROM copyright_email_intake_encryption_keys
    WHERE copyright_notice_email_intake_id = ${intakeId}`)
  return rows[0] ? null : prepareCopyrightEncryptionKey('intake')
}

/** Erased skeleton readers do not attempt to recover a destroyed owner key. */
export function openCopyrightSecretsForCiphertexts(
  subject: CopyrightEncryptionSubject,
  ciphertexts: readonly (string | null)[],
  transaction?: TransactionQuery,
): Promise<ScopedCopyrightSecrets | null> {
  return ciphertexts.some(value => value !== null && value !== 'erased')
    ? openCopyrightSecrets(subject, transaction)
    : Promise.resolve(null)
}

/** Final receipt explanations have a separate authority from short-lived private intake data. */
export async function prepareCopyrightReceiptEncryptionKey(
  receiptId: string,
): Promise<PreparedCopyrightEncryptionKey | null> {
  const { rows } = await read(sql`/* readCopyrightReceiptKeyAttachment */
    SELECT copyright_retention_key_id FROM copyright_email_receipt_encryption_keys
    WHERE copyright_notice_email_intake_receipt_id = ${receiptId}`)
  return rows[0] ? null : prepareCopyrightEncryptionKey('receipt')
}
