import type { APIGatewayProxyEvent } from 'aws-lambda'
import { RequestParseError } from '../errors.mts'
import { getRequestPath } from './event-path.mts'
import { parseImageParams, type ImageParams } from './parse-image-params.mts'

export interface ParsedRequest extends ImageParams {
  key: string
  placementId: string
  placementRevision: number
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const PLACEMENT_PATH = new RegExp(`^/images/placements/(${UUID})/(0|[1-9][0-9]*)/(${UUID})$`)

export function parseRequest(event: APIGatewayProxyEvent): ParsedRequest {
  const params = event.queryStringParameters || {}
  const headers = event.headers || {}

  const requestPath = getRequestPath(event)
  const match = PLACEMENT_PATH.exec(requestPath)
  if (!match || match[0] !== requestPath) {
    throw new RequestParseError('Invalid placement route', 400)
  }
  const placementRevision = Number(match[2])
  if (!Number.isSafeInteger(placementRevision) || placementRevision > 2147483647) {
    throw new RequestParseError('Invalid placement revision', 400)
  }
  return {
    key: match[3]!,
    placementId: match[1]!,
    placementRevision,
    ...parseImageParams(params, headers),
  }
}
