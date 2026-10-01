import type {
  CopyrightEmailSesVerdict,
  CopyrightEmailSesVerdicts,
} from '@/lib/api/client/copyright-email-intakes'

const VERDICT_LABELS: Record<CopyrightEmailSesVerdict, string> = {
  pass: 'Pass',
  fail: 'Fail',
  gray: 'Inconclusive',
  processing_failed: 'Check failed',
  unknown: 'Not reported',
}

const CHECKS: Array<{ key: keyof CopyrightEmailSesVerdicts; label: string }> = [
  { key: 'spf', label: 'SPF' },
  { key: 'dkim', label: 'DKIM' },
  { key: 'dmarc', label: 'DMARC' },
  { key: 'spam', label: 'Spam' },
  { key: 'virus', label: 'Malware' },
]

// Staff read these as risk notes beside the evidence. None of them rejects, delays, or otherwise
// decides a notice: a legitimate claimant can fail SPF or DKIM through a forwarder or mailing list.
const FAILURE_NOTES: Partial<Record<keyof CopyrightEmailSesVerdicts, string>> = {
  spf: 'SPF failed: the sending server is not authorised for the sender domain, so the From address may be spoofed.',
  dkim: 'DKIM failed: the message signature did not validate, so the message may have been altered or forged.',
  dmarc:
    'DMARC failed: the message did not meet the sender domain authentication policy, so the From address may be spoofed.',
  spam: 'Spam: SES classified this message as spam.',
}

export type SesVerdictRow = {
  key: keyof CopyrightEmailSesVerdicts
  label: string
  verdict: CopyrightEmailSesVerdict
  verdictLabel: string
}

export function sesVerdictRows(verdicts: CopyrightEmailSesVerdicts): SesVerdictRow[] {
  return CHECKS.map(({ key, label }) => ({
    key,
    label,
    verdict: verdicts[key],
    verdictLabel: VERDICT_LABELS[verdicts[key]],
  }))
}

/** Risk notes for the checks SES reported as failed, in display order. Never a decision. */
export function sesFailureNotes(verdicts: CopyrightEmailSesVerdicts): string[] {
  const notes: string[] = []
  for (const { key } of CHECKS) {
    const note = FAILURE_NOTES[key]
    if (note && verdicts[key] === 'fail') notes.push(note)
  }
  return notes
}

/** Only an explicit malware `fail` quarantines the original; anything short of `pass` warrants care. */
export function sesMalwareState(
  virus: CopyrightEmailSesVerdict,
): 'quarantined' | 'unconfirmed' | 'clean' {
  if (virus === 'fail') return 'quarantined'
  return virus === 'pass' ? 'clean' : 'unconfirmed'
}

/** The raw `.eml` link staff may use, or null when SES quarantined the original or none was sent. */
export function availableOriginalUrl(
  downloadUrl: string | null,
  virus: CopyrightEmailSesVerdict,
): string | null {
  return sesMalwareState(virus) === 'quarantined' ? null : downloadUrl
}

export function sesVerdictLabel(verdict: CopyrightEmailSesVerdict): string {
  return VERDICT_LABELS[verdict]
}
