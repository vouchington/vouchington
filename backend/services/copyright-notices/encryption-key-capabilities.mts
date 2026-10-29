import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { OwnedTransaction, TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type CopyrightEncryptionOwner = { kind: 'notice' | 'intake' | 'receipt'; id: string }

/** A short-lived preparation scope; it is never shared or retained after its producer finishes. */
export class PreparedCopyrightEncryptionKey implements AsyncDisposable {
  readonly id: string
  readonly kind: CopyrightEncryptionOwner['kind']
  private readonly key: Buffer
  private owner: CopyrightEncryptionOwner | null = null
  private disposed = false
  constructor(id: string, kind: CopyrightEncryptionOwner['kind'], key: Buffer) {
    this.id = id
    this.kind = kind
    this.key = key
  }

  encrypt(plaintext: string, purpose: string, owner: CopyrightEncryptionOwner): string {
    if (this.disposed) throw new Error('Copyright encryption key scope is disposed')
    if (!this.owner || owner.kind !== this.owner.kind || owner.id !== this.owner.id)
      throw new Error('Copyright encryption key owner mismatch')
    return encryptWithKey(this.id, this.key, plaintext, purpose, owner)
  }

  async attach(owner: CopyrightEncryptionOwner, query: TransactionQuery): Promise<void> {
    if (
      this.disposed ||
      owner.kind !== this.kind ||
      (this.owner && (this.owner.kind !== owner.kind || this.owner.id !== owner.id))
    )
      throw new Error('Copyright prepared key cannot attach to this owner')
    const statement =
      owner.kind === 'notice'
        ? sql`/* attachCopyrightNoticeEncryptionKey */ INSERT INTO copyright_notice_encryption_keys (copyright_notice_id, copyright_retention_key_id) VALUES (${owner.id}, ${this.id})`
        : owner.kind === 'receipt'
          ? sql`/* attachCopyrightReceiptEncryptionKey */ INSERT INTO copyright_email_receipt_encryption_keys (copyright_notice_email_intake_receipt_id, copyright_retention_key_id) VALUES (${owner.id}, ${this.id}) ON CONFLICT (copyright_notice_email_intake_receipt_id) DO NOTHING`
          : sql`/* attachCopyrightIntakeEncryptionKey */ INSERT INTO copyright_email_intake_encryption_keys (copyright_notice_email_intake_id, copyright_retention_key_id) VALUES (${owner.id}, ${this.id}) ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING`
    const attached = await query(statement)
    if (attached.rowCount === 1) this.owner = { ...owner }
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.disposed = true
    this.key.fill(0)
  }
}

function additionalData(owner: CopyrightEncryptionOwner, purpose: string): Buffer {
  return Buffer.from(JSON.stringify([owner.kind, owner.id, purpose]), 'utf8')
}

function encryptWithKey(
  id: string,
  key: Buffer,
  plaintext: string,
  purpose: string,
  owner: CopyrightEncryptionOwner,
): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(additionalData(owner, purpose))
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [
    'c1',
    id,
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

export type CopyrightEncryptionSubject =
  | CopyrightEncryptionOwner
  | {
      kind: 'submission' | 'restriction' | 'form_intake' | 'delivery' | 'redress_request'
      id: string
    }

export class ScopedCopyrightSecrets implements AsyncDisposable {
  private disposed = false
  private readonly id: string
  private readonly key: Buffer
  private readonly owner: CopyrightEncryptionOwner
  private readonly ownedQuery?: OwnedTransaction
  constructor(
    id: string,
    key: Buffer,
    owner: CopyrightEncryptionOwner,
    ownedQuery?: OwnedTransaction,
  ) {
    this.id = id
    this.key = key
    this.owner = owner
    this.ownedQuery = ownedQuery
  }

  readonly encryptSecret = (plaintext: string, purpose: string): string => {
    if (this.disposed) throw new Error('Copyright encryption key scope is disposed')
    return encryptWithKey(this.id, this.key, plaintext, purpose, this.owner)
  }

  readonly decryptSecret = (ciphertext: string, purpose: string): string => {
    if (this.disposed) throw new Error('Copyright encryption key scope is disposed')
    const parts = ciphertext.split(':')
    if (parts.length !== 5 || parts[0] !== 'c1' || parts[1] !== this.id)
      throw new Error('Copyright ciphertext does not belong to its owner')
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(parts[2]!, 'base64'))
    decipher.setAAD(additionalData(this.owner, purpose))
    decipher.setAuthTag(Buffer.from(parts[3]!, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(parts[4]!, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.key.fill(0)
    if (this.ownedQuery) await this.ownedQuery[Symbol.asyncDispose]()
  }
}
