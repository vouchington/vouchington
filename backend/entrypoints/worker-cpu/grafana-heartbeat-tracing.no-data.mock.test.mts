/* eslint-disable no-mistakes/vitest-mock-test-file-naming -- Routed to backend-no-data-mocks for the project-level @sentry/node mock (vitest.setup.sentry-mock.mts); asserts sentrySuppressTracingMock. No in-file vi.mock, so the rule's unnecessaryMock branch fires; the .mock suffix is load-bearing for routing. */
import { describe, expect, it } from 'vitest'
import { sentrySuppressTracingMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { sendGrafanaHeartbeat } from './grafana-heartbeat.mts'

const HEARTBEAT_URL =
  'https://oncall-prod-us-central-0.grafana.net/oncall/integrations/v1/formatted_webhook/token/heartbeat/'
type ExternalFetch = NonNullable<Parameters<typeof sendGrafanaHeartbeat>[1]>

describe('worker-cpu Grafana heartbeat tracing', () => {
  it('keeps the credential-bearing URL out of Sentry by suppressing tracing around the request', async () => {
    let suppressed = false
    sentrySuppressTracingMock.mockImplementation((callback: () => unknown) => {
      suppressed = true
      try {
        return callback()
      } finally {
        suppressed = false
      }
    })
    const suppressedDuringFetch: boolean[] = []
    const fetch: ExternalFetch = async () => {
      suppressedDuringFetch.push(suppressed)
      return new Response(null, { status: 200 })
    }

    await sendGrafanaHeartbeat(HEARTBEAT_URL, fetch)

    expect(suppressedDuringFetch).toEqual([true])
    expect(suppressed).toBe(false)
  })
})
