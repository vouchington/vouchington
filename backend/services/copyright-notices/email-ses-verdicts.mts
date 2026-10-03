/**
 * SES receipt verdicts for an emailed copyright notice. `unknown` means SES never reported the
 * check (header absent, unparseable, or unrecognised), and must never be read as `pass`.
 */
export type CopyrightEmailSesVerdict = 'pass' | 'fail' | 'gray' | 'processing_failed' | 'unknown'

export type CopyrightEmailSesVerdicts = {
  spf: CopyrightEmailSesVerdict
  dkim: CopyrightEmailSesVerdict
  dmarc: CopyrightEmailSesVerdict
  spam: CopyrightEmailSesVerdict
  virus: CopyrightEmailSesVerdict
}

export function isAuthenticatedCopyrightEmail(verdicts: CopyrightEmailSesVerdicts): boolean {
  return verdicts.dmarc === 'pass' && verdicts.spam !== 'fail' && verdicts.virus !== 'fail'
}
