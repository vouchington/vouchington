import { afterEach, describe, expect, it } from 'vitest'
import { shouldSkipUnavailableBedrockIntegration } from './test-availability.mts'

describe('test-availability', () => {
  const originalRequireBedrockIntegration = process.env.REQUIRE_BEDROCK_INTEGRATION

  afterEach(() => {
    if (originalRequireBedrockIntegration === undefined) {
      delete process.env.REQUIRE_BEDROCK_INTEGRATION
      return
    }
    process.env.REQUIRE_BEDROCK_INTEGRATION = originalRequireBedrockIntegration
  })

  describe('shouldSkipUnavailableBedrockIntegration', () => {
    it('skips local runs when AWS credentials are unavailable', () => {
      delete process.env.REQUIRE_BEDROCK_INTEGRATION
      const error = new Error('Could not load credentials')
      error.name = 'CredentialsProviderError'

      expect(shouldSkipUnavailableBedrockIntegration(error)).toBe(true)
    })

    it('skips local runs when Bedrock invoke access is unavailable', () => {
      delete process.env.REQUIRE_BEDROCK_INTEGRATION
      const error = new Error('not authorized to perform: bedrock:InvokeModel')
      error.name = 'AccessDeniedException'

      expect(shouldSkipUnavailableBedrockIntegration(error)).toBe(true)
    })

    it('skips local runs when AWS credential resolution fails with SDK text only', () => {
      delete process.env.REQUIRE_BEDROCK_INTEGRATION

      expect(
        shouldSkipUnavailableBedrockIntegration(
          new Error('Resolved credential object is not valid'),
        ),
      ).toBe(true)
    })

    it('skips local runs when Bedrock invoke access fails with SDK text only', () => {
      delete process.env.REQUIRE_BEDROCK_INTEGRATION

      expect(
        shouldSkipUnavailableBedrockIntegration(
          new Error('not authorized to perform: bedrock:InvokeModel'),
        ),
      ).toBe(true)
    })

    it('does not skip unavailable Bedrock integration when required', () => {
      process.env.REQUIRE_BEDROCK_INTEGRATION = 'true'
      const error = new Error('not authorized to perform: bedrock:InvokeModel')
      error.name = 'AccessDeniedException'

      expect(shouldSkipUnavailableBedrockIntegration(error)).toBe(false)
    })

    it('does not skip unrelated errors', () => {
      delete process.env.REQUIRE_BEDROCK_INTEGRATION

      expect(shouldSkipUnavailableBedrockIntegration(new Error('unexpected failure'))).toBe(false)
    })
  })
})
