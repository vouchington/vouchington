const REQUIRE_BEDROCK_INTEGRATION = 'true'

export function shouldSkipUnavailableBedrockIntegration(error: unknown): boolean {
  if (process.env.REQUIRE_BEDROCK_INTEGRATION === REQUIRE_BEDROCK_INTEGRATION) return false
  return isBedrockIntegrationUnavailableError(error)
}

function isBedrockIntegrationUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const errorText = String(error)
  return (
    error.name === 'CredentialsProviderError' ||
    error.name === 'AccessDeniedException' ||
    errorText.includes('Could not load credentials') ||
    errorText.includes('Resolved credential object is not valid') ||
    errorText.includes('bedrock:InvokeModel')
  )
}
