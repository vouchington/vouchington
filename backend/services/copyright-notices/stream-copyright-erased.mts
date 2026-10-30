import type { ScopedCopyrightSecrets } from './encryption-key-capabilities.mts'

/**
 * What the copyright retention sweep leaves in a ciphertext column it has erased. The account
 * export's marker is pinned to the case-erasure sentinel by the domain API tests.
 */
export const EXPORT_COPYRIGHT_ERASED_CIPHERTEXT = 'erased'

/** Written into an export cell whose content the retention sweep has erased. */
export const EXPORT_COPYRIGHT_ERASED_TEXT = '[erased by the retention policy]'

/**
 * Decrypts a stored copyright text, or returns the erased marker once the sweep has erased it. The
 * sweep clears the owner link in the same transaction as the text, so an export reaches an erased
 * row only if a later change keeps the link; the export then states the erasure instead of failing.
 */
export function decryptExportedCopyrightText(
  ciphertext: string,
  purpose: string,
  secrets: ScopedCopyrightSecrets | null,
): string {
  if (ciphertext === EXPORT_COPYRIGHT_ERASED_CIPHERTEXT) return EXPORT_COPYRIGHT_ERASED_TEXT
  if (!secrets) throw new Error('Live copyright export ciphertext has no owner key')
  return secrets.decryptSecret(ciphertext, purpose)
}

/** Decrypts a stored JSON document, or returns null once the retention sweep has erased it. */
export function decryptExportedCopyrightJson<Body>(
  ciphertext: string,
  purpose: string,
  secrets: ScopedCopyrightSecrets | null,
): Body | null {
  if (ciphertext === EXPORT_COPYRIGHT_ERASED_CIPHERTEXT) return null
  if (!secrets) throw new Error('Live copyright export ciphertext has no owner key')
  return JSON.parse(secrets.decryptSecret(ciphertext, purpose)) as Body
}

/** The cells of an export row whose content the retention sweep erased, each holding the marker. */
export function erasedExportFields<Key extends string>(keys: readonly Key[]): Record<Key, string> {
  return Object.fromEntries(keys.map(key => [key, EXPORT_COPYRIGHT_ERASED_TEXT])) as Record<
    Key,
    string
  >
}
