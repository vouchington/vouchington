import { decryptSecret } from '@modules/token-secrets'
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
): CopyrightCounterNoticeGuidance | null
export function parseStoredCopyrightSubmissionGuidance(
  ciphertext: string | null,
  submissionId: string,
  kind: 'court_or_ccb_hold',
): CopyrightLegalHoldGuidance | null
export function parseStoredCopyrightSubmissionGuidance(
  ciphertext: string | null,
  submissionId: string,
  kind: 'counter_notice' | 'court_or_ccb_hold',
) {
  const live = liveCopyrightCiphertext(ciphertext)
  if (!live) return null
  const value: unknown = JSON.parse(
    decryptSecret(live, `copyright-submission-guidance:${submissionId}`),
  )
  return kind === 'counter_notice'
    ? parseCopyrightCounterNoticeGuidance(value)
    : parseCopyrightLegalHoldGuidance(value)
}
