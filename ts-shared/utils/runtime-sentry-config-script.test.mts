import { describe, expect, it } from 'vitest'
import {
  buildRuntimeSentryConfigScript,
  RUNTIME_PUBLIC_CONFIG_READY_EVENT,
} from './runtime-sentry-config-script.mts'

describe('runtime Sentry config script', () => {
  it('serializes only a validated DSN and dispatches the shared readiness event', () => {
    const script = buildRuntimeSentryConfigScript('production', 'https://public@example.test/123')

    expect(script).toContain('https://public@example.test/123')
    expect(script).toContain(RUNTIME_PUBLIC_CONFIG_READY_EVENT)
  })

  it('omits malformed DSNs', () => {
    const script = buildRuntimeSentryConfigScript('production', 'invalid-private-value')

    expect(script).not.toContain('invalid-private-value')
    expect(script).not.toContain('sentryDsn')
  })
})
