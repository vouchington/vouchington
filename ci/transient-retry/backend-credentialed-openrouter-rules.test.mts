import { describe, expect, it } from 'vitest'
import { buildBackendCredentialedFailureLog } from './backend-credentialed-fixtures.mts'
import { isBackendCredentialedProviderSmokeTestTransient } from './backend-credentialed-rules.mts'

describe('backend credentialed OpenRouter transient classification', () => {
  it('recognizes an owned OpenRouter provider-side failure', () => {
    const log = buildBackendCredentialedFailureLog([
      {
        project: 'backend-openrouter',
        path: 'backend/modules/structured-decisions/structured-decisions.openrouter.test.mts',
        markerLines: ['Structured-decision provider returned HTTP 529.'],
      },
    ])
    expect(isBackendCredentialedProviderSmokeTestTransient(log)).toBe(true)
  })

  it('does not treat an OpenRouter assertion failure as transient', () => {
    const log = buildBackendCredentialedFailureLog([
      {
        project: 'backend-openrouter',
        path: 'backend/modules/structured-decisions/structured-decisions.openrouter.test.mts',
        markerLines: ['AssertionError: expected TypeSafe provider'],
      },
    ])
    expect(isBackendCredentialedProviderSmokeTestTransient(log)).toBe(false)
  })
})
