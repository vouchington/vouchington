import type { ScopedCopyrightSecrets } from './encryption-keys.mts'

/** What the retention sweep leaves in a ciphertext column it has erased; see the erasure spec. */
export const COPYRIGHT_ERASED_CIPHERTEXT = 'erased'

/** Shown in place of text the retention sweep has erased. */
const COPYRIGHT_ERASED_TEXT = '[erased]'

/** A ciphertext column's value, or null once the retention sweep has erased it. */
export function liveCopyrightCiphertext(ciphertext: string | null): string | null {
  return ciphertext === COPYRIGHT_ERASED_CIPHERTEXT ? null : ciphertext
}

/** Decrypts a stored copyright text, or returns the erased marker once the sweep has erased it. */
export function decryptCopyrightText(
  ciphertext: string,
  purpose: string,
  secrets: ScopedCopyrightSecrets | null,
): string {
  const live = liveCopyrightCiphertext(ciphertext)
  if (live === null) return COPYRIGHT_ERASED_TEXT
  if (!secrets) throw new Error('Live copyright ciphertext has no owner key')
  return secrets.decryptSecret(live, purpose)
}

/** Decrypts a stored JSON document, or an empty object once the sweep has erased it. */
export function decryptCopyrightJson(
  ciphertext: string,
  purpose: string,
  secrets: ScopedCopyrightSecrets | null,
): string {
  const live = liveCopyrightCiphertext(ciphertext)
  if (live === null) return '{}'
  if (!secrets) throw new Error('Live copyright ciphertext has no owner key')
  return secrets.decryptSecret(live, purpose)
}
