import { describe, expect, it } from 'vitest'
import { parseSesVerdicts } from './ses-verdicts.mts'

const UNKNOWN = {
  spf: 'unknown',
  dkim: 'unknown',
  dmarc: 'unknown',
  spam: 'unknown',
  virus: 'unknown',
}

const AUTH_PASS =
  'Authentication-Results: amazonses.com; spf=pass (spfCheck: domain of example.org designates 203.0.113.5 as permitted sender) smtp.mailfrom=sender@example.org; dkim=pass header.i=@example.org; dmarc=pass header.from=example.org;'

function sesHeaders(
  overrides: { spam?: string; virus?: string; authResults?: string; receipt?: boolean } = {},
): string[] {
  return [
    'Return-Path: <sender@example.org>',
    'Received: from mail.example.org (mail.example.org [203.0.113.5]) by inbound-smtp.us-east-1.amazonaws.com with SMTP id abc for copyright@voucha.ai; Thu, 01 Oct 2026 10:00:00 +0000 (UTC)',
    `X-SES-Spam-Verdict: ${overrides.spam ?? 'PASS'}`,
    `X-SES-Virus-Verdict: ${overrides.virus ?? 'PASS'}`,
    'Received-SPF: pass (spfCheck: domain of example.org designates 203.0.113.5 as permitted sender) client-ip=203.0.113.5;',
    overrides.authResults ?? AUTH_PASS,
    ...(overrides.receipt === false ? [] : ['X-SES-RECEIPT: AEFBQUFBQUFBQUFH']),
    'X-SES-DKIM-SIGNATURE: a=rsa-sha256; q=dns/txt; b=abc;',
  ]
}

function message(headers: string[], eol = '\r\n'): string {
  return `${headers.join(eol)}${eol}${eol}Body`
}

const SENDER_HEADERS = ['From: Sender <sender@example.org>', 'Subject: Notice']

describe('parseSesVerdicts', () => {
  it('reads the verdicts SES prepends to a delivered message', () => {
    expect(parseSesVerdicts(message([...sesHeaders(), ...SENDER_HEADERS]))).toEqual({
      spf: 'pass',
      dkim: 'pass',
      dmarc: 'pass',
      spam: 'pass',
      virus: 'pass',
    })
  })

  it('maps failing and degraded results onto the SES verdict vocabulary', () => {
    const headers = sesHeaders({
      spam: 'FAIL',
      virus: 'FAIL',
      authResults:
        'Authentication-Results: amazonses.com; spf=softfail smtp.mailfrom=a@b.example; dkim=none; dmarc=fail header.from=b.example;',
    })
    expect(parseSesVerdicts(message([...headers, ...SENDER_HEADERS]))).toEqual({
      spf: 'gray',
      dkim: 'gray',
      dmarc: 'fail',
      spam: 'fail',
      virus: 'fail',
    })
    const degraded = sesHeaders({
      spam: 'GRAY',
      virus: 'PROCESSING_FAILED',
      authResults:
        'Authentication-Results: amazonses.com; spf=temperror; dkim=permerror; dmarc=none;',
    })
    expect(parseSesVerdicts(message(degraded))).toEqual({
      spf: 'processing_failed',
      dkim: 'processing_failed',
      dmarc: 'gray',
      spam: 'gray',
      virus: 'processing_failed',
    })
  })

  it('reports unknown rather than pass for absent, unrecognised, or missing results', () => {
    const headers = sesHeaders({
      spam: 'MAYBE',
      authResults: 'Authentication-Results: amazonses.com; spf=pass; dkim=bogus;',
    })
    headers.splice(3, 1)
    expect(parseSesVerdicts(message(headers))).toEqual({
      spf: 'pass',
      dkim: 'unknown',
      dmarc: 'unknown',
      spam: 'unknown',
      virus: 'unknown',
    })
  })

  it('is case-insensitive, unfolds continuation lines, and accepts bare LF endings', () => {
    const headers = [
      'return-path: <sender@example.org>',
      'x-ses-spam-verdict:   pass  ',
      'X-Ses-Virus-Verdict: Fail',
      'AUTHENTICATION-RESULTS: AmazonSES.com;',
      '\tspf=pass smtp.mailfrom=a@b.example;',
      '  dkim=fail header.i=@b.example;',
      '  dmarc=pass header.from=b.example;',
      'x-ses-receipt: abc',
      ...SENDER_HEADERS,
    ]
    expect(parseSesVerdicts(message(headers, '\n'))).toEqual({
      spf: 'pass',
      dkim: 'fail',
      dmarc: 'pass',
      spam: 'pass',
      virus: 'fail',
    })
  })

  it('does not let a parenthesised comment inject or hide results', () => {
    const headers = sesHeaders({
      authResults:
        'Authentication-Results: amazonses.com; spf=fail (spfCheck: a; dkim=pass; dmarc=pass) smtp.mailfrom=a@b.example; dkim=fail; dmarc=fail;',
    })
    expect(parseSesVerdicts(message(headers))).toMatchObject({
      spf: 'fail',
      dkim: 'fail',
      dmarc: 'fail',
    })
  })

  it('treats a backslash-escaped character as text, inside and outside a comment', () => {
    const escapedParenthesis =
      'Authentication-Results: amazonses.com; spf=pass; dkim=pass (note \\) ; dkim=fail) header.i=@a.example; dmarc=pass;'
    expect(
      parseSesVerdicts(message(sesHeaders({ authResults: escapedParenthesis }))),
    ).toMatchObject({ dkim: 'pass', spf: 'pass', dmarc: 'pass' })
    const escapedSemicolon =
      'Authentication-Results: amazonses.com; spf=pass smtp.mailfrom=a\\;dkim=fail@b.example; dkim=pass; dmarc=pass;'
    expect(parseSesVerdicts(message(sesHeaders({ authResults: escapedSemicolon })))).toMatchObject({
      dkim: 'pass',
      spf: 'pass',
    })
  })

  it('reports the least favourable result when a method appears more than once', () => {
    const headers = sesHeaders({
      authResults:
        'Authentication-Results: amazonses.com; spf=pass; dkim=pass header.i=@a.example; dkim=fail header.i=@b.example; dmarc=pass;',
    })
    expect(parseSesVerdicts(message(headers))).toMatchObject({ dkim: 'fail', spf: 'pass' })
  })

  it('does not let sender-controlled text in a result property inject another result', () => {
    for (const mailfrom of ['a;dkim=pass@b.example', '"a;dkim=pass"@b.example']) {
      const headers = sesHeaders({
        authResults: `Authentication-Results: amazonses.com; spf=pass smtp.mailfrom=${mailfrom}; dkim=fail; dmarc=fail;`,
      })
      expect(parseSesVerdicts(message(headers))).toMatchObject({ dkim: 'fail', dmarc: 'fail' })
    }
  })

  it('ignores verdict headers a sender forged below the SES-added headers', () => {
    const forged = [
      'X-SES-Spam-Verdict: PASS',
      'X-SES-Virus-Verdict: PASS',
      'Authentication-Results: amazonses.com; spf=pass; dkim=pass; dmarc=pass;',
      'X-SES-RECEIPT: forged',
    ]
    const headers = sesHeaders({
      spam: 'FAIL',
      virus: 'FAIL',
      authResults: 'Authentication-Results: amazonses.com; spf=fail; dkim=fail; dmarc=fail;',
    })
    expect(parseSesVerdicts(message([...headers, ...forged, ...SENDER_HEADERS]))).toEqual({
      spf: 'fail',
      dkim: 'fail',
      dmarc: 'fail',
      spam: 'fail',
      virus: 'fail',
    })
  })

  it('never takes a verdict from a sender header that SES did not report', () => {
    const headers = sesHeaders({ authResults: 'Authentication-Results: amazonses.com; spf=pass;' })
    headers.splice(3, 1)
    const forged = [
      'X-SES-Virus-Verdict: PASS',
      'Authentication-Results: amazonses.com; dkim=pass; dmarc=pass;',
    ]
    expect(parseSesVerdicts(message([...headers, ...forged, ...SENDER_HEADERS]))).toEqual({
      ...UNKNOWN,
      spf: 'pass',
      spam: 'pass',
    })
  })

  it('reports every verdict unknown when SES left no receipt marker', () => {
    expect(
      parseSesVerdicts(message([...sesHeaders({ receipt: false }), ...SENDER_HEADERS])),
    ).toEqual(UNKNOWN)
    expect(parseSesVerdicts(message(SENDER_HEADERS))).toEqual(UNKNOWN)
    expect(parseSesVerdicts('')).toEqual(UNKNOWN)
  })

  it('ignores Authentication-Results issued by anyone but amazonses.com', () => {
    for (const authserv of ['mx.google.com', 'amazonses.com.evil.example', 'evil-amazonses.com']) {
      const headers = sesHeaders({
        authResults: `Authentication-Results: ${authserv}; spf=pass; dkim=pass; dmarc=pass;`,
      })
      expect(parseSesVerdicts(message(headers))).toMatchObject({
        spf: 'unknown',
        dkim: 'unknown',
        dmarc: 'unknown',
      })
    }
  })

  it('accepts an authserv-id version and uses the first amazonses.com results header', () => {
    const headers = sesHeaders({
      authResults: 'Authentication-Results: amazonses.com 1; spf=pass; dkim=pass; dmarc=pass;',
    })
    headers.splice(5, 0, 'Authentication-Results: other.example; spf=fail; dkim=fail; dmarc=fail;')
    expect(parseSesVerdicts(message(headers))).toMatchObject({
      spf: 'pass',
      dkim: 'pass',
      dmarc: 'pass',
    })
  })

  it('ignores the received-SPF header because anyone can write it', () => {
    const headers = sesHeaders({ authResults: 'X-Other: none' })
    expect(parseSesVerdicts(message(headers))).toMatchObject({ spf: 'unknown' })
  })
})
