import { describe, expect, it } from 'vitest'

import {
  MAX_SENTRY_DIAGNOSTIC_ITEM_TYPES,
  readSentryEnvelopeDiagnostics,
} from './sentry-envelope-policy.mts'

describe('readSentryEnvelopeDiagnostics', () => {
  it('keeps only the worker item-type cap from a longer envelope', () => {
    const types = [
      'event',
      'transaction',
      'profile',
      'replay_event',
      'check_in',
      'attachment',
      'client_report',
      'span',
      'statsd',
    ]
    const items = types.map(type => `{"type":"${type}","length":0}`).join('\n')
    const envelope = `{"dsn":"https://public@example.ingest.sentry.io/1"}\n${items}\n`

    expect(readSentryEnvelopeDiagnostics(envelope, 1_000_000).envelopeItemTypes).toEqual(
      types.slice(0, MAX_SENTRY_DIAGNOSTIC_ITEM_TYPES),
    )
  })
})
