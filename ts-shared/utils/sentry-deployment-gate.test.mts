import { describe, expect, it } from 'vitest'
import { resolveSentryEnablement } from './sentry-deployment-gate.mts'

describe('resolveSentryEnablement', () => {
  it.each(['staging', 'production'] as const)('allows the deployed environment %s', environment => {
    const result = resolveSentryEnablement({ environment, otelEnabled: false })
    expect(result).toEqual({ enabled: true, environment, otelOnly: false })
  })

  it.each([undefined, 'test', 'development', 'ci-main', ''])('fails closed for %s', environment => {
    const result = resolveSentryEnablement({ environment, otelEnabled: false })
    expect(result.enabled).toBe(false)
    expect(result.otelOnly).toBe(false)
  })

  it.each(['Staging', 'PRODUCTION', 'sTaGiNg'])(
    'allows the deployed environment %s case-insensitively',
    environment => {
      const result = resolveSentryEnablement({ environment, otelEnabled: false })
      expect(result.enabled).toBe(true)
      expect(result.environment).toBe(environment)
    },
  )

  it('stays enabled with no Sentry transport when OTel-only mode opts in outside a deployed environment', () => {
    const result = resolveSentryEnablement({ environment: 'development', otelEnabled: true })
    expect(result).toEqual({ enabled: true, environment: 'development', otelOnly: true })
  })

  it('prefers deployed-environment reporting over OTel-only mode when both apply', () => {
    const result = resolveSentryEnablement({ environment: 'staging', otelEnabled: true })
    expect(result).toEqual({ enabled: true, environment: 'staging', otelOnly: false })
  })
})
