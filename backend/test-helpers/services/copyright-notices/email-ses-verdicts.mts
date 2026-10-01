import type { CopyrightEmailSesVerdicts } from '../../../services/copyright-notices/email-ses-verdicts.mts'

/** The verdicts of a delivery that passed every SES check. */
export const PASSING_COPYRIGHT_EMAIL_SES_VERDICTS: CopyrightEmailSesVerdicts = {
  spf: 'pass',
  dkim: 'pass',
  dmarc: 'pass',
  spam: 'pass',
  virus: 'pass',
}

/** Passing verdicts with the SES malware verdict replaced, as when SES quarantines a message. */
export function copyrightEmailSesVerdictsWithVirus(
  virus: CopyrightEmailSesVerdicts['virus'],
): CopyrightEmailSesVerdicts {
  return { ...PASSING_COPYRIGHT_EMAIL_SES_VERDICTS, virus }
}
