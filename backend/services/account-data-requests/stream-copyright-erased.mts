import { decryptSecret } from '@modules/token-secrets'

/**
 * What the copyright retention sweep leaves in a ciphertext column it has erased. This package
 * cannot import `@services/copyright-notices` (that package depends on `@services/users`, which
 * depends on this one), so a test in `backend/api` pins the value to `COPYRIGHT_ERASED_CIPHERTEXT`.
 */
export const EXPORT_COPYRIGHT_ERASED_CIPHERTEXT = 'erased'

/** Written into an export cell whose content the retention sweep has erased. */
export const EXPORT_COPYRIGHT_ERASED_TEXT = '[erased by the retention policy]'

/**
 * Decrypts a stored copyright text, or returns the erased marker once the sweep has erased it. The
 * sweep clears the owner link in the same transaction as the text, so an export reaches an erased
 * row only if a later change keeps the link; the export then states the erasure instead of failing.
 */
export function decryptExportedCopyrightText(ciphertext: string, purpose: string): string {
  return ciphertext === EXPORT_COPYRIGHT_ERASED_CIPHERTEXT
    ? EXPORT_COPYRIGHT_ERASED_TEXT
    : decryptSecret(ciphertext, purpose)
}

/** Decrypts a stored JSON document, or returns null once the retention sweep has erased it. */
export function decryptExportedCopyrightJson<Body>(
  ciphertext: string,
  purpose: string,
): Body | null {
  return ciphertext === EXPORT_COPYRIGHT_ERASED_CIPHERTEXT
    ? null
    : (JSON.parse(decryptSecret(ciphertext, purpose)) as Body)
}

/** The cells of an export row whose content the retention sweep erased, each holding the marker. */
export function erasedExportFields<Key extends string>(keys: readonly Key[]): Record<Key, string> {
  return Object.fromEntries(keys.map(key => [key, EXPORT_COPYRIGHT_ERASED_TEXT])) as Record<
    Key,
    string
  >
}
