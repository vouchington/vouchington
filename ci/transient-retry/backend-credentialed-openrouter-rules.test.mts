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

  describe('flex-tier unavailability', () => {
    const flexUnavailableMessage =
      'Flex processing is temporarily unavailable. Please try again later or use standard processing.'
    const flexProbePath = 'backend/modules/openrouter-utils/create-response.openrouter.test.mts'
    const secondProbePath =
      'backend/modules/structured-decisions/structured-decisions.openrouter.test.mts'
    const flexFailureMarkerLines = [
      `Error: OpenAI response failed (server_error): ${flexUnavailableMessage}`,
      "Serialized Error: { id: 'gen-example', status: 'failed', usage: null, service_tier: 'flex', code: 'server_error', reason: undefined }",
    ]

    it('recognizes the sole failing probe reporting flex processing as a server_error', () => {
      const log = buildBackendCredentialedFailureLog([
        { project: 'backend-openrouter', path: flexProbePath, markerLines: flexFailureMarkerLines },
      ])
      expect(isBackendCredentialedProviderSmokeTestTransient(log)).toBe(true)
    })

    it('does not treat the flex message without a server_error code as transient', () => {
      const log = buildBackendCredentialedFailureLog([
        {
          project: 'backend-openrouter',
          path: flexProbePath,
          markerLines: [
            `Error: OpenAI response failed (unknown): ${flexUnavailableMessage}`,
            "Serialized Error: { id: 'gen-example', status: 'failed', service_tier: 'flex', code: undefined }",
          ],
        },
      ])
      expect(isBackendCredentialedProviderSmokeTestTransient(log)).toBe(false)
    })

    it('does not treat a server_error without the flex message as transient', () => {
      const log = buildBackendCredentialedFailureLog([
        {
          project: 'backend-openrouter',
          path: flexProbePath,
          markerLines: ['Error: OpenAI response failed (server_error): The model is overloaded.'],
        },
      ])
      expect(isBackendCredentialedProviderSmokeTestTransient(log)).toBe(false)
    })

    it('does not treat flex unavailability as transient when a second test file also fails', () => {
      const log = buildBackendCredentialedFailureLog([
        { project: 'backend-openrouter', path: flexProbePath, markerLines: flexFailureMarkerLines },
        {
          project: 'backend-openrouter',
          path: secondProbePath,
          markerLines: flexFailureMarkerLines,
        },
      ])
      expect(isBackendCredentialedProviderSmokeTestTransient(log)).toBe(false)
    })
  })
})
