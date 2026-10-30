import { beginTransaction, read, type TransactionQuery } from '@data-stores/psql'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'
import { beforeEach, afterEach, vi } from 'vitest'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import {
  attachCopyrightEncryptionKey,
  type PreparedCopyrightEncryptionKey,
} from '../services/copyright-notices/encryption-keys.mts'
import { handleCopyrightKeyObjectCommand } from './copyright-key-object-store.mts'

/** Provider-edge faults only: the fixture neither knows nor reproduces the encryption algorithm. */
export function useCopyrightKeyObjectFaults() {
  let loseNextPut = false
  let lostKeyId: string | null = null
  const uploadedKeyIds = new Set<string>()
  const refused = new Set<string>()
  const corruptReads = new Map<string, 'missing_body' | 'declared_oversized' | 'stream_oversized'>()
  const truncatedListings = new Set<string>()
  const retainedDeletes = new Set<string>()
  beforeEach(() => {
    loseNextPut = false
    lostKeyId = null
    uploadedKeyIds.clear()
    refused.clear()
    corruptReads.clear()
    truncatedListings.clear()
    retainedDeletes.clear()
    vi.spyOn(S3Client.prototype, 'send').mockImplementation((async (command: unknown) => {
      if (command instanceof GetObjectCommand) {
        const fault = corruptReads.get(command.input.Key?.slice('retention-keys/'.length) ?? '')
        if (fault === 'missing_body') return { $metadata: {}, ContentLength: 0 }
        if (fault === 'declared_oversized')
          return { $metadata: {}, ContentLength: 4097, Body: Readable.from([Buffer.alloc(1)]) }
        if (fault === 'stream_oversized')
          return {
            $metadata: {},
            ContentLength: 0,
            Body: Readable.from([Buffer.alloc(2048), Buffer.alloc(2049)]),
          }
      }
      if (
        command instanceof ListObjectVersionsCommand &&
        truncatedListings.has(command.input.Prefix?.slice('retention-keys/'.length) ?? '')
      )
        return { $metadata: {}, IsTruncated: true, Versions: [] }
      if (
        command instanceof DeleteObjectsCommand &&
        command.input.Delete?.Objects?.every(object =>
          retainedDeletes.has(object.Key?.slice('retention-keys/'.length) ?? ''),
        )
      )
        return { $metadata: {}, Errors: [] }
      if (
        command instanceof GetObjectCommand &&
        refused.has(command.input.Key?.slice('retention-keys/'.length) ?? '')
      ) {
        const error = new Error('Missing authoritative copyright key')
        error.name = 'NoSuchKey'
        throw error
      }
      if (command instanceof PutObjectCommand)
        uploadedKeyIds.add(command.input.Key!.slice('retention-keys/'.length))
      const result = handleCopyrightKeyObjectCommand(command)
      if (result === null) throw new Error('Unexpected non-key S3 operation')
      const response = await result
      if (loseNextPut && command instanceof PutObjectCommand) {
        loseNextPut = false
        lostKeyId = command.input.Key!.slice('retention-keys/'.length)
        throw new Error('Lost copyright key upload acknowledgment')
      }
      return response
    }) as never)
  })
  afterEach(() => vi.restoreAllMocks())
  return {
    loseNextUploadAcknowledgment() {
      loseNextPut = true
    },
    lostUploadKeyId() {
      if (!lostKeyId) throw new Error('No upload acknowledgment was lost')
      return lostKeyId
    },
    uploadedKeyIds() {
      return [...uploadedKeyIds]
    },
    refuseKeyRead(id: string) {
      refused.add(id)
    },
    allowKeyRead(id: string) {
      refused.delete(id)
    },
    corruptKeyRead(id: string, fault: 'missing_body' | 'declared_oversized' | 'stream_oversized') {
      corruptReads.set(id, fault)
    },
    truncateKeyVersions(id: string) {
      truncatedListings.add(id)
    },
    retainKeyVersionOnDelete(id: string) {
      retainedDeletes.add(id)
    },
  }
}

/** Minimal real notice owner for crypto/FK tests; the transaction can deliberately roll back. */
export async function createCopyrightKeyNotice(
  prepared: PreparedCopyrightEncryptionKey,
  rollback = false,
) {
  const noticeId = uuidv7()
  const purpose = `copyright-key-fixture:${noticeId}`
  await using query = await beginTransaction()
  await attachCopyrightEncryptionKey(prepared, { kind: 'notice', id: noticeId }, query)
  const ciphertext = prepared.encrypt('Synthetic claimant contact', purpose, {
    kind: 'notice',
    id: noticeId,
  })
  await query(sql`/* createCopyrightKeyNoticeFixture */ INSERT INTO copyright_notices (
    id, jurisdiction, legal_basis, received_at, claimant_display_name, claimant_contact_ciphertext, work_description, policy_version
  ) VALUES (${noticeId}, 'us_dmca', 'copyright', clock_timestamp(), 'Synthetic claimant', ${ciphertext}, 'Synthetic work', 'key-fixture')`)
  if (rollback) await query.rollback()
  else await query.commit()
  return { noticeId, purpose, ciphertext, keyId: prepared.id }
}

export async function readCopyrightKeyReservation(id: string) {
  const { rows } = await read<{ object_created_at: Date | null; destroyed_at: Date | null }>(sql`
    /* readCopyrightKeyReservationFixture */ SELECT object_created_at, destroyed_at FROM copyright_retention_keys WHERE id = ${id}`)
  return rows[0] ?? null
}

/** Two actual transaction identities for testing that a batch capability cannot escape its owner. */
export async function withCopyrightBatchTransactions(
  run: (owner: TransactionQuery, other: TransactionQuery) => Promise<void>,
): Promise<void> {
  await using owner = await beginTransaction()
  await using other = await beginTransaction()
  await run(owner, other)
  await owner.commit()
  await other.commit()
}
