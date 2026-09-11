import type { APIGatewayProxyEvent } from 'aws-lambda'
import { isOgRequest, isSideloadRequest } from './event-path.mts'
import { parseRequest, type ParsedRequest } from './parse.mts'
import { parseSideloadRequest, type ParsedSideloadRequest } from './parse-sideload.mts'
import { parseOgRequest, type ParsedOgRequest } from './parse-og.mts'

type ParsedS3Request = ParsedRequest & { type: 's3' }
type ParsedSideloadRequestWithType = ParsedSideloadRequest & { type: 'sideload' }
type ParsedOgRequestWithType = ParsedOgRequest & { type: 'og' }
type ParsedRouterRequest = ParsedS3Request | ParsedSideloadRequestWithType | ParsedOgRequestWithType

export function parseRouterRequest(
  event: APIGatewayProxyEvent,
  options: { sideloadSigningKeys?: string } = {},
): ParsedRouterRequest {
  // Detect route type
  // OG route: /og/{base64url}
  // Sideload route: /sideload/{base64url}
  // S3 route: everything else (uses query params)
  if (isOgRequest(event)) {
    const ogRequest = parseOgRequest(event, options.sideloadSigningKeys)
    return {
      type: 'og',
      ...ogRequest,
    }
  }

  if (isSideloadRequest(event)) {
    const sideloadRequest = parseSideloadRequest(event, options.sideloadSigningKeys)
    return {
      type: 'sideload',
      ...sideloadRequest,
    }
  }

  // Default to S3 route
  const s3Request = parseRequest(event)
  return {
    type: 's3',
    ...s3Request,
  }
}
