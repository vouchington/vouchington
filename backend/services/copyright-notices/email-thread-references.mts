import { decryptSecret, encryptSecret, hashToken } from '@modules/token-secrets'

export const COPYRIGHT_EMAIL_THREAD_REFERENCE_PURPOSE = 'copyright-email-thread-reference'

export type CopyrightEmailThreadReferenceKind = 'message_id' | 'in_reply_to' | 'references'

export type CopyrightEmailThreadReferenceRow = {
  lookup_token: string
  reference_kind: CopyrightEmailThreadReferenceKind
}

export type CopyrightEmailReplyHeaders = {
  inReplyTo: string[]
  references: string[]
}

export function copyrightEmailReplyHeaders(input: {
  inReplyTo?: string[]
  replyReferences: string[]
}): CopyrightEmailReplyHeaders {
  return { inReplyTo: input.inReplyTo ?? [], references: input.replyReferences }
}

export function encryptCopyrightEmailReplyHeaders(
  headers: CopyrightEmailReplyHeaders,
  purpose: string,
): string | null {
  if (headers.inReplyTo.length === 0 && headers.references.length === 0) return null
  return encryptSecret(JSON.stringify(headers), purpose)
}

export function decryptCopyrightEmailReplyHeaders(
  ciphertext: string | null,
  purpose: string,
): CopyrightEmailReplyHeaders {
  if (!ciphertext) return { inReplyTo: [], references: [] }
  const parsed = JSON.parse(decryptSecret(ciphertext, purpose)) as {
    inReplyTo?: unknown
    references?: unknown
  }
  return { inReplyTo: stringList(parsed.inReplyTo), references: stringList(parsed.references) }
}

export function buildCopyrightEmailThreadReferenceRows(input: {
  messageId: string | null
  inReplyTo: string[]
  references: string[]
}): CopyrightEmailThreadReferenceRow[] {
  const rows: CopyrightEmailThreadReferenceRow[] = []
  const seen = new Set<string>()
  const add = (kind: CopyrightEmailThreadReferenceKind, value: string) => {
    const normalized = normalizeCopyrightEmailReference(value)
    if (!normalized) return
    const lookupToken = hashToken(COPYRIGHT_EMAIL_THREAD_REFERENCE_PURPOSE, normalized)
    const key = `${kind}:${lookupToken}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push({ lookup_token: lookupToken, reference_kind: kind })
  }
  if (input.messageId) add('message_id', input.messageId)
  for (const value of input.inReplyTo) add('in_reply_to', value)
  for (const value of input.references) add('references', value)
  return rows
}

/** Plaintext reply tokens, in header order, used to explain a case match. */
export function normalizedCopyrightEmailReplyValues(headers: CopyrightEmailReplyHeaders): string[] {
  const values: string[] = []
  const seen = new Set<string>()
  for (const value of [...headers.inReplyTo, ...headers.references]) {
    const normalized = normalizeCopyrightEmailReference(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    values.push(normalized)
  }
  return values
}

export function normalizeCopyrightEmailReference(reference: string): string {
  const normalized = reference.trim().replace(/\s+/g, ' ')
  return normalized.startsWith('<') && normalized.endsWith('>')
    ? normalized.slice(1, -1).trim()
    : normalized
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : []
}
