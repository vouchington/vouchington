import { describe, expect, it } from 'vitest'
import {
  composeBeforeSend,
  scrubEvent,
  scrubSpanAttributes as scrubSpans,
} from '@vouchington/utils/observability'
import { SENTRY_SCRUB_OPTIONS } from './sentry-scrub-options.mts'

const scrubSentryEvent = (event: Parameters<typeof scrubEvent>[0]) =>
  scrubEvent(event, SENTRY_SCRUB_OPTIONS)
const scrubSpanAttributes = (data: Record<string, unknown>) =>
  scrubSpans(data, SENTRY_SCRUB_OPTIONS)

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
    const callback = composeBeforeSend<{ request?: object }, undefined>(
      () => ({
        request: {
          data: { legalName: 'Claimant' },
          headers: { 'X-App-Attest-Assertion': 'proof' },
          url: 'https://grafana.example/oncall/integrations/v1/formatted_webhook/bearer/heartbeat/?token=secret',
        },
      }),
      SENTRY_SCRUB_OPTIONS,
    )
    expect(await callback({}, undefined)).toEqual({
      request: {
        headers: { 'X-App-Attest-Assertion': '[Filtered]' },
        url: 'https://grafana.example/oncall/integrations/v1/formatted_webhook/[REDACTED]/heartbeat/',
      },
    })
  })

  it('redacts Grafana path credentials on spans and breadcrumbs', () => {
    const url = 'https://grafana.example/oncall/integrations/v1/formatted_webhook/bearer/heartbeat/'
    const filtered =
      'https://grafana.example/oncall/integrations/v1/formatted_webhook/[REDACTED]/heartbeat/'
    expect(scrubSpanAttributes({ 'url.full': url })).toEqual({ 'url.full': filtered })
    expect(scrubSentryEvent({ breadcrumbs: [{ data: { url } }] })).toEqual({
      breadcrumbs: [{ data: { url: filtered } }],
    })
  })
})
