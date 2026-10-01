import type {
  CopyrightEmailSesVerdict,
  CopyrightEmailSesVerdicts,
} from '@services/copyright-notices'
import { readHeaderFields, splitAuthResults, type HeaderField } from './ses-header-fields.mts'

type AuthMethod = 'spf' | 'dkim' | 'dmarc'

const TRUSTED_AUTHSERV_ID = 'amazonses.com'
const SES_VERDICT_VALUES: Record<string, CopyrightEmailSesVerdict> = {
  PASS: 'pass',
  FAIL: 'fail',
  GRAY: 'gray',
  PROCESSING_FAILED: 'processing_failed',
}
// RFC 8601 result keywords as SES maps them onto its PASS/FAIL/GRAY/PROCESSING_FAILED vocabulary.
const AUTH_RESULT_VALUES: Record<string, CopyrightEmailSesVerdict> = {
  pass: 'pass',
  fail: 'fail',
  hardfail: 'fail',
  softfail: 'gray',
  neutral: 'gray',
  none: 'gray',
  policy: 'gray',
  temperror: 'processing_failed',
  permerror: 'processing_failed',
}
// Least favourable first: a method is only `pass` when every result reported for it passed.
const VERDICT_SEVERITY: CopyrightEmailSesVerdict[] = ['fail', 'processing_failed', 'gray', 'pass']

function unknownSesVerdicts(): CopyrightEmailSesVerdicts {
  return { spf: 'unknown', dkim: 'unknown', dmarc: 'unknown', spam: 'unknown', virus: 'unknown' }
}

/**
 * Reads the verdicts Amazon SES records for a received message from its raw RFC 5322 header block.
 *
 * Only the header fields above the topmost `X-SES-RECEIPT` are trusted: SES prepends every header
 * it writes (verdicts, `Authentication-Results`, then `X-SES-RECEIPT`) above the headers the sender
 * supplied, so a sender can forge anything below that marker but never above it. This assumes SES
 * always writes `X-SES-RECEIPT`; with no marker nothing is trusted and every verdict is `unknown`.
 * `Received-SPF` is never read, and `Authentication-Results` counts only with the exact
 * `amazonses.com` authserv-id. Anything missing or unrecognised is `unknown`, never `pass`.
 */
export function parseSesVerdicts(message: string): CopyrightEmailSesVerdicts {
  const fields = readHeaderFields(message)
  const receiptIndex = fields.findIndex(field => field.name === 'x-ses-receipt')
  if (receiptIndex === -1) return unknownSesVerdicts()
  const trusted = fields.slice(0, receiptIndex)
  const authResults = readAuthResults(trusted)
  return {
    spf: authResults.spf ?? 'unknown',
    dkim: authResults.dkim ?? 'unknown',
    dmarc: authResults.dmarc ?? 'unknown',
    spam: readSesVerdict(trusted, 'x-ses-spam-verdict'),
    virus: readSesVerdict(trusted, 'x-ses-virus-verdict'),
  }
}

function readSesVerdict(trusted: HeaderField[], name: string): CopyrightEmailSesVerdict {
  const value = trusted.find(field => field.name === name)?.value.toUpperCase()
  return (value && SES_VERDICT_VALUES[value]) || 'unknown'
}

function readAuthResults(
  trusted: HeaderField[],
): Partial<Record<AuthMethod, CopyrightEmailSesVerdict>> {
  for (const field of trusted) {
    if (field.name !== 'authentication-results') continue
    const [authservSegment = '', ...resultSegments] = splitAuthResults(field.value)
    const authservId = authservSegment.trim().split(/\s+/)[0]?.toLowerCase()
    if (authservId === TRUSTED_AUTHSERV_ID) return summarizeAuthResults(resultSegments)
  }
  return {}
}

function summarizeAuthResults(
  segments: string[],
): Partial<Record<AuthMethod, CopyrightEmailSesVerdict>> {
  const reported: Record<AuthMethod, CopyrightEmailSesVerdict[]> = { spf: [], dkim: [], dmarc: [] }
  for (const segment of segments) {
    const match = /^\s*(spf|dkim|dmarc)\s*=\s*([a-z]+)/i.exec(segment)
    const verdict = match?.[2] && AUTH_RESULT_VALUES[match[2].toLowerCase()]
    if (match?.[1] && verdict) reported[match[1].toLowerCase() as AuthMethod].push(verdict)
  }
  const summary: Partial<Record<AuthMethod, CopyrightEmailSesVerdict>> = {}
  for (const method of ['spf', 'dkim', 'dmarc'] as const) {
    const worst = VERDICT_SEVERITY.find(verdict => reported[method].includes(verdict))
    if (worst) summary[method] = worst
  }
  return summary
}
