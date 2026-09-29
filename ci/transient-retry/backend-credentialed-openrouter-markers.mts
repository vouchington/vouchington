/**
 * OpenRouter provider-transport marker groups for a credentialed probe failure. Each group is a
 * set of substrings that must all appear together inside one Vitest failure block. None pin a
 * `describe`/`it` title or a timeout digit count.
 */
const backendCredentialedOpenRouterServerErrorMarkers = [
  'Structured-decision provider returned HTTP 5',
]
const backendCredentialedOpenRouterRateLimitMarkers = [
  'Structured-decision provider returned HTTP 429',
]
/**
 * OpenRouter's flex service tier reports its own capacity shortage as a failed response carrying
 * the `server_error` code. Requiring both the code and the message keeps other failed-response
 * codes (and other `server_error` messages) as look-alikes that need investigation.
 */
const backendCredentialedOpenRouterFlexUnavailableMarkers = [
  'server_error',
  'Flex processing is temporarily unavailable',
]

export const backendCredentialedOpenRouterMarkerGroups = [
  backendCredentialedOpenRouterRateLimitMarkers,
  backendCredentialedOpenRouterServerErrorMarkers,
  backendCredentialedOpenRouterFlexUnavailableMarkers,
]
