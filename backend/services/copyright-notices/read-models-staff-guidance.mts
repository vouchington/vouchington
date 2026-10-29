import type { ScopedCopyrightSecrets } from './encryption-keys.mts'
import { liveCopyrightCiphertext } from './erased-ciphertext.mts'
import { parseCopyrightCounterNoticeGuidance } from './counter-notice-guidance.mts'
import { parseCopyrightLegalHoldGuidance } from './legal-hold-guidance.mts'
import type {
  CopyrightCounterNoticeGuidance,
  CopyrightLegalHoldGuidance,
} from '@ts-shared/utils/copyright-submission-guidance'

/** Staff projections revalidate decrypted, immutable advisory output on every read. */
export function parseStoredCopyrightSubmissionGuidance(
  ciphertext: string | null,
  submissionId: string,
  kind: 'counter_notice',
  secrets: ScopedCopyrightSecrets | null,
): CopyrightCounterNoticeGuidance | null
export function parseStoredCopyrightSubmissionGuidance(
  ciphertext: string | null,
  submissionId: string,
  kind: 'court_or_ccb_hold',
  secrets: ScopedCopyrightSecrets | null,
): CopyrightLegalHoldGuidance | null
export function parseStoredCopyrightSubmissionGuidance(
  ciphertext: string | null,
  submissionId: string,
  kind: 'counter_notice' | 'court_or_ccb_hold',
  secrets: ScopedCopyrightSecrets | null,
) {
  const live = liveCopyrightCiphertext(ciphertext)
  if (!live) return null
  if (!secrets) throw new Error('Live copyright guidance has no owner key')
  const value: unknown = JSON.parse(
    secrets.decryptSecret(live, `copyright-submission-guidance:${submissionId}`),
  )
  return kind === 'counter_notice'
    ? parseCopyrightCounterNoticeGuidance(value)
    : parseCopyrightLegalHoldGuidance(value)
}
