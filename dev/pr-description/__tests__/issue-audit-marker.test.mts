import { describe, expect, it } from 'vitest'

import {
  formatIssueAuditMarkerHint,
  isValidAuditClassification,
  parseIssueAuditKeepOpenDecisions,
} from '../issue-audit-marker.mts'

describe('parseIssueAuditKeepOpenDecisions', () => {
  it('parses a well-formed keep-open marker', () => {
    const body =
      '<!-- issue-audit: keep-open #7995 because unrelated: keyword match only, no supersession -->'
    expect(parseIssueAuditKeepOpenDecisions(body)).toEqual([
      {
        classification: 'unrelated',
        number: 7995,
        reason: 'keyword match only, no supersession',
      },
    ])
  })

  it('parses multiple markers in one body', () => {
    const body = [
      '<!-- issue-audit: keep-open #1 because locally-actionable: fix ships next PR -->',
      '<!-- issue-audit: keep-open #2 because live-credential-required: needs prod creds -->',
    ].join('\n')
    expect(parseIssueAuditKeepOpenDecisions(body).map(d => d.number)).toEqual([1, 2])
  })

  it('skips a marker with an unrecognized classification', () => {
    const body = '<!-- issue-audit: keep-open #1 because maybe-later: revisit next sprint -->'
    expect(parseIssueAuditKeepOpenDecisions(body)).toEqual([])
  })

  it('skips a marker with an empty reason', () => {
    const body = '<!-- issue-audit: keep-open #1 because unrelated:  -->'
    expect(parseIssueAuditKeepOpenDecisions(body)).toEqual([])
  })

  it('returns an empty array when no marker is present', () => {
    expect(parseIssueAuditKeepOpenDecisions('## Related issues\n\nCloses #1\n')).toEqual([])
  })

  it('parses a qualified owner/repo marker and lowercases the repo', () => {
    const body =
      '<!-- issue-audit: keep-open Other/Repo#5 because unrelated: different issue, another repo -->'
    expect(parseIssueAuditKeepOpenDecisions(body)).toEqual([
      {
        classification: 'unrelated',
        number: 5,
        reason: 'different issue, another repo',
        repo: 'other/repo',
      },
    ])
  })

  it('does not hang on an unterminated marker (ReDoS regression)', () => {
    const body = `<!-- issue-audit: keep-open #1 because unrelated:${' '.repeat(50_000)}`
    const start = Date.now()
    expect(parseIssueAuditKeepOpenDecisions(body)).toEqual([])
    expect(Date.now() - start).toBeLessThan(1000)
  })
})

describe('isValidAuditClassification', () => {
  it.each(['locally-actionable', 'live-credential-required', 'evidence-gated', 'unrelated'])(
    'accepts %s',
    value => {
      expect(isValidAuditClassification(value)).toBe(true)
    },
  )

  it('rejects an unrecognized classification', () => {
    expect(isValidAuditClassification('maybe-later')).toBe(false)
  })
})

describe('formatIssueAuditMarkerHint', () => {
  it('renders the marker grammar for a bare reference key', () => {
    expect(formatIssueAuditMarkerHint('#7995')).toBe(
      '<!-- issue-audit: keep-open #7995 because <classification>: <reason> -->',
    )
  })

  it('renders the marker grammar for a qualified owner/repo reference key', () => {
    expect(formatIssueAuditMarkerHint('other/repo#7995')).toBe(
      '<!-- issue-audit: keep-open other/repo#7995 because <classification>: <reason> -->',
    )
  })
})
