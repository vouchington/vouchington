import { describe, expect, it } from 'vitest'
import {
  composeSentryBeforeSend,
  scrubSentryEvent,
  scrubSpanAttributes,
} from './sentry-event-scrubbing.mts'

describe('Voucha credential scrubbing policy', () => {
  it('filters product credentials in request metadata and span headers', () => {
    const headers = {
      'x-cf-worker-secret': 'worker',
      'x-bedrock-batch-shared-key': 'batch',
      'x-voucha-cache-purge-secret': 'purge',
      'x-app-attest-assertion': 'assertion',
      'x-app-attest-nonce': 'nonce',
      'x-app-attest-challenge-id': 'challenge',
      'copyright-guest-capability': 'capability',
      'idempotency-key': 'retry',
    }
    const filtered = Object.fromEntries(Object.keys(headers).map(key => [key, '[Filtered]']))
    expect(scrubSentryEvent({ request: { headers } })).toEqual({ request: { headers: filtered } })
    const attributes = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [
        `http.request.header.${key.replaceAll('-', '_')}`,
        value,
      ]),
    )
    expect(scrubSpanAttributes(attributes)).toEqual(
      Object.fromEntries(Object.keys(attributes).map(key => [key, '[Filtered]'])),
    )
  })

  it('applies product policy after a beforeSend callback adds request data', async () => {
    const callback = composeSentryBeforeSend<{ request?: object }, undefined>(() => ({
      request: {
        data: { legalName: 'Claimant' },
        headers: { 'X-App-Attest-Assertion': 'proof' },
        url: 'https://grafana.example/oncall/integrations/v1/formatted_webhook/bearer/heartbeat/?token=secret',
      },
    }))
    expect(await callback({}, undefined)).toEqual({
      request: {
        headers: { 'X-App-Attest-Assertion': '[Filtered]' },
        url: 'https://grafana.example/oncall/integrations/v1/formatted_webhook/[REDACTED]/heartbeat/',
      },
    })
  })
})
