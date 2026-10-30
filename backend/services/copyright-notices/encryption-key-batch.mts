import { readCopyrightBatchOwnerKeys } from './encryption-key-batch-owners.mts'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { getCopyrightRetentionWindows } from './config.mts'
import { ScopedCopyrightSecrets, type CopyrightEncryptionOwner } from './encryption-keys.mts'
import { readCopyrightEncryptionKeyObject } from './encryption-key-objects.mts'

function ownerIdentity(owner: CopyrightEncryptionOwner): string {
  return `${owner.kind}:${owner.id}`
}

export class CopyrightSecretBatch implements AsyncDisposable {
  readonly scopes = new Map<string, ScopedCopyrightSecrets>()
  private readonly query: TransactionQuery
  private disposed = false
  constructor(query: TransactionQuery) {
    this.query = query
  }
  assertTransaction(query: TransactionQuery): void {
    if (this.disposed || query !== this.query)
      throw new Error('Copyright encryption batch is outside its transaction scope')
  }
  get(owner: CopyrightEncryptionOwner): ScopedCopyrightSecrets {
    this.assertTransaction(this.query)
    const scope = this.scopes.get(ownerIdentity(owner))
    if (!scope) throw new Error('Copyright batch owner key is unavailable')
    return scope
  }
  forCiphertexts(
    owner: CopyrightEncryptionOwner,
    ciphertexts: readonly (string | null)[],
  ): ScopedCopyrightSecrets | null {
    return ciphertexts.some(value => value !== null && value !== 'erased') ? this.get(owner) : null
  }
  async [Symbol.asyncDispose](): Promise<void> {
    this.disposed = true
    for (const scope of this.scopes.values()) {
      // oxlint-disable-next-line no-await-in-loop -- disposal only clears a capped local key buffer.
      await scope[Symbol.asyncDispose]()
    }
  }
}

/** Batch SQL first, then a configured cap of concurrent authoritative key-object reads. */
export async function openCopyrightOwnerSecretBatch(
  owners: readonly CopyrightEncryptionOwner[],
  query: TransactionQuery,
  access: 'read' | 'write' = 'write',
): Promise<CopyrightSecretBatch> {
  const distinct = [...new Map(owners.map(owner => [ownerIdentity(owner), owner])).values()]
  const limits = getCopyrightRetentionWindows()
  if (distinct.length > limits.encryptionOwnerBatchSize)
    throw new RangeError('Copyright encryption owner batch exceeds its cap')
  const result = new CopyrightSecretBatch(query)
  if (distinct.length === 0) return result
  const rows = await readCopyrightBatchOwnerKeys(distinct, query, access)
  if (rows.length !== distinct.length)
    throw new Error('Copyright encryption batch has a missing owner key')
  try {
    for (let start = 0; start < rows.length; start += limits.encryptionFetchConcurrency) {
      // oxlint-disable-next-line no-await-in-loop -- both the owner count and each fetch wave have runtime caps.
      const wave = await Promise.allSettled(
        rows.slice(start, start + limits.encryptionFetchConcurrency).map(async row => {
          const key = await readCopyrightEncryptionKeyObject(row.id)
          result.scopes.set(
            ownerIdentity({ kind: row.kind, id: row.owner_id }),
            new ScopedCopyrightSecrets(row.id, key, { kind: row.kind, id: row.owner_id }),
          )
        }),
      )
      const failure = wave.find(item => item.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
    }
    return result
  } catch (err) {
    await result[Symbol.asyncDispose]()
    throw err
  }
}

/** Resolve concrete delivery FKs once, then share one scoped capability per distinct owner. */
export async function openCopyrightDeliverySecretBatch(
  intentIds: readonly string[],
  query: TransactionQuery,
  ownerScopes?: CopyrightSecretBatch,
) {
  ownerScopes?.assertTransaction(query)
  const ids = [...new Set(intentIds)]
  if (ids.length > getCopyrightRetentionWindows().encryptionOwnerBatchSize)
    throw new RangeError('Copyright delivery encryption batch exceeds its cap')
  const { rows } = await query<{
    id: string
    copyright_notice_id: string | null
    copyright_notice_email_intake_receipt_id: string | null
  }>(sql`
    /* resolveCopyrightDeliveryBatchOwners */ SELECT id, copyright_notice_id, copyright_notice_email_intake_receipt_id
    FROM copyright_notice_delivery_work_items WHERE id = ANY(${ids}::uuid[]) ORDER BY id`)
  if (rows.length !== ids.length) throw new Error('Copyright delivery encryption owner is missing')
  const owners = new Map(
    rows.map(row => [
      row.id,
      row.copyright_notice_id
        ? { kind: 'notice' as const, id: row.copyright_notice_id }
        : { kind: 'intake' as const, id: row.copyright_notice_email_intake_receipt_id! },
    ]),
  )
  if ([...owners.values()].some(owner => !owner.id))
    throw new Error('Copyright delivery encryption owner is missing')
  const scopes = ownerScopes ?? (await openCopyrightOwnerSecretBatch([...owners.values()], query))
  return {
    get(intentId: string): ScopedCopyrightSecrets {
      const owner = owners.get(intentId)
      if (!owner) throw new Error('Copyright delivery is outside its encryption batch')
      return scopes.get(owner)
    },
    async [Symbol.asyncDispose]() {
      if (!ownerScopes) await scopes[Symbol.asyncDispose]()
    },
  }
}

/** Read-model owner collection is batched; erased-only rows never fetch a destroyed key. */
export function openCopyrightCiphertextSecretBatch(
  entries: readonly { owner: CopyrightEncryptionOwner; ciphertexts: readonly (string | null)[] }[],
  query: TransactionQuery,
): Promise<CopyrightSecretBatch> {
  return openCopyrightOwnerSecretBatch(
    entries.flatMap(entry =>
      entry.ciphertexts.some(value => value !== null && value !== 'erased') ? [entry.owner] : [],
    ),
    query,
    'read',
  )
}
