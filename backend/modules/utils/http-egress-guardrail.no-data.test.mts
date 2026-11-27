import { MockAgent } from 'undici'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureMessageMock } from '../../test-helpers/vitest.setup.sentry-mock.mts'
import { enableApiEgressGuardrail, getExternalFetch } from './http.mts'
import { getConfiguredSentryHost } from './ipv6-allowlist.mts'

const SENTRY_DSN = ['https://', 'a'.repeat(32), '@o', 12345, '.ingest.eu.sentry.io/', 67890].join(
  '',
)
const SENTRY_ORIGIN = new URL(SENTRY_DSN).origin
const SENTRY_HOST = new URL(SENTRY_DSN).hostname

describe('API egress guardrail Sentry wiring', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reports a configured but unaudited origin through recordOffAllowlistEgress with its Sentry tags', async () => {
    vi.stubEnv('SENTRY_DSN', SENTRY_DSN)
    expect(getConfiguredSentryHost()).toBe(SENTRY_HOST)
    enableApiEgressGuardrail()

    const mockAgent = new MockAgent()
    mockAgent.disableNetConnect()
    mockAgent
      .get(SENTRY_ORIGIN)
      .intercept({ path: '/api/123/envelope?secret=1', method: 'POST' })
      .reply(200, 'ok')

    try {
      const response = await getExternalFetch()(`${SENTRY_ORIGIN}/api/123/envelope?secret=1`, {
        method: 'POST',
        dispatcher: mockAgent,
      } as RequestInit)

      expect(response.status).toBe(200)
      await expect(response.text()).resolves.toBe('ok')
      expect(sentryCaptureMessageMock).toHaveBeenCalledExactlyOnceWith(
        `off-allowlist API egress: ${SENTRY_HOST}`,
        {
          level: 'warning',
          tags: { egress_guardrail: 'off_allowlist', egress_host: SENTRY_HOST },
          extra: { path: '/api/123/envelope', method: 'POST' },
        },
      )
    } finally {
      await mockAgent.close()
    }
  })
})
