import { describe, expect, it } from 'vitest'
import { getSentryEnvelopeDiagnostics } from './sentry-envelope-diagnostics.mts'

function makeEnvelope(items: string): string {
  return `{"dsn":"https://public@example.ingest.sentry.io/1"}\n${items}`
}

describe('getSentryEnvelopeDiagnostics', () => {
  it('returns no diagnostics when the envelope header has no newline terminator', () => {
    expect(
      getSentryEnvelopeDiagnostics('{"dsn":"https://public@example.ingest.sentry.io/1"}'),
    ).toEqual({})
  })

  it('counts item headers while skipping blank separator lines', () => {
    expect(getSentryEnvelopeDiagnostics(makeEnvelope('\n{"type":"event"}\n{}\n'))).toEqual({
      envelopeItemCount: 1,
      envelopeItemTypes: ['event'],
    })
  })

  it('skips CR-only blank item header lines', () => {
    expect(getSentryEnvelopeDiagnostics(makeEnvelope('\r\n{"type":"event"}\n{}\n'))).toEqual({
      envelopeItemCount: 1,
      envelopeItemTypes: ['event'],
    })
  })

  it('stops before incomplete item headers', () => {
    expect(getSentryEnvelopeDiagnostics(makeEnvelope('{"type":"event"'))).toEqual({})
  })

  it('keeps diagnostics collected before a malformed item header', () => {
    expect(
      getSentryEnvelopeDiagnostics(makeEnvelope('{"type":"event"}\n{}\nnot-json\n{}')),
    ).toEqual({
      envelopeItemCount: 1,
      envelopeItemTypes: ['event'],
    })
  })

  it('stops before non-object item headers', () => {
    expect(getSentryEnvelopeDiagnostics(makeEnvelope('null\n{}'))).toEqual({})
  })

  it('uses item payload lengths and consumes CRLF payload separators', () => {
    expect(
      getSentryEnvelopeDiagnostics(
        makeEnvelope('{"type":"event","length":2}\n{}\r\n{"type":"transaction"}\n{}\n'),
      ),
    ).toEqual({
      envelopeItemCount: 2,
      envelopeItemTypes: ['event', 'transaction'],
    })
  })

  it('uses UTF-8 byte lengths for non-ASCII payloads before later items', () => {
    const payload = '🙂'
    const payloadLength = new TextEncoder().encode(payload).length

    expect(
      getSentryEnvelopeDiagnostics(
        makeEnvelope(
          `{"type":"event","length":${payloadLength}}\n${payload}\n{"type":"transaction"}\n{}\n`,
        ),
      ),
    ).toEqual({
      envelopeItemCount: 2,
      envelopeItemTypes: ['event', 'transaction'],
    })
  })

  it('deduplicates safe item types and caps the diagnostic type list', () => {
    const itemHeaders = [
      'event',
      'event',
      'transaction',
      'profile',
      'replay_event',
      'check_in',
      'attachment',
      'client_report',
      'span',
      'invalid type',
      'too-long-'.repeat(9),
    ]
      .map(type => `{"type":"${type}","length":0}`)
      .join('\n')

    expect(getSentryEnvelopeDiagnostics(makeEnvelope(`${itemHeaders}\n`))).toEqual({
      envelopeItemCount: 11,
      envelopeItemTypes: [
        'event',
        'transaction',
        'profile',
        'replay_event',
        'check_in',
        'attachment',
        'client_report',
        'span',
      ],
    })
  })
})
