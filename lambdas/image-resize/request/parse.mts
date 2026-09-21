import type { APIGatewayProxyEvent } from 'aws-lambda'
import { RequestParseError } from '../errors.mts'
import { getRequestPath } from './event-path.mts'
import { parseImageParams, type ImageParams } from './parse-image-params.mts'

export interface ParsedRequest extends ImageParams {
  key: string
  placementId?: string
  placementRevision?: number
}

// S3 keys can contain slashes (multi-segment keys like `photos/cat.jpg`).
// The /images/{key} route in http-request-to-lambda-event.mts captures
// everything after `/images/` as the key, so we must accept the same set.
// Allow alphanumeric, hyphens, underscores, dots, plus signs, and forward
// slashes for nested prefixes. Reject empty segments (`//`) and leading or
// trailing slashes — those would round-trip to malformed S3 keys. The charset
// excludes `%`, `\0`, backslashes and whitespace, so encoded traversal
// (`%2e%2e%2f`), null bytes and control characters never pass.
const VALID_S3_KEY_PATTERN = /^[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)*$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidS3Key(key: string): boolean {
  if (!VALID_S3_KEY_PATTERN.test(key)) return false
  // Reject `.`/`..` path segments — defense-in-depth against traversal-shaped
  // keys. S3's keyspace is flat (so `..` never escapes a bucket), but rejecting
  // these closes literal traversal regardless of any upstream path decoding and
  // keeps real keys (UUIDs / hex hashes) unaffected.
  return key.split('/').every(segment => segment !== '.' && segment !== '..')
}

export function parseRequest(event: APIGatewayProxyEvent): ParsedRequest {
  const params = event.queryStringParameters || {}
  const headers = event.headers || {}

  // Parse key (required).
  // Production: CloudFront → Lambda Function URL forwards /images/{key} as-is
  // without injecting a `key` query param (that injection is local-dev-only, in
  // http-request-to-lambda-event.mts). Extract the key from the path so both
  // code paths produce a valid request. Lambda Function URLs use rawPath (V2
  // payload format); API Gateway REST (V1) uses path — accept both.
  const requestPath = getRequestPath(event)
  const placementMatch = requestPath.match(/^\/images\/placements\/([^/]+)\/([^/]+)\/(.+)$/)
  const pathMatch = requestPath.match(/^\/images\/(.+)$/)
  const placementId = placementMatch?.[1]
  const placementRevisionText = placementMatch?.[2]
  const placementKey = placementMatch?.[3]
  const key = placementKey ?? params.key ?? (pathMatch ? pathMatch[1] : undefined)

  if (requestPath.startsWith('/images/placements/') && !placementMatch) {
    throw new RequestParseError('Invalid placement route', 400)
  }

  if (!key) {
    throw new RequestParseError('Missing required parameter: key', 400)
  }
  if (!isValidS3Key(key)) {
    throw new RequestParseError(
      'Invalid key: must contain only alphanumeric characters, dots, hyphens, underscores, plus signs, or forward slashes (with no empty segments)',
      400,
    )
  }

  if (placementMatch) {
    if (!placementId || !UUID_PATTERN.test(placementId)) {
      throw new RequestParseError('Invalid placement ID', 400)
    }
    if (!placementRevisionText || !/^(?:0|[1-9]\d*)$/.test(placementRevisionText)) {
      throw new RequestParseError('Invalid placement revision', 400)
    }
    const placementRevision = Number(placementRevisionText)
    if (!Number.isSafeInteger(placementRevision)) {
      throw new RequestParseError('Invalid placement revision', 400)
    }
    return {
      key,
      placementId,
      placementRevision,
      ...parseImageParams(params, headers),
    }
  }

  return { key, ...parseImageParams(params, headers) }
}
