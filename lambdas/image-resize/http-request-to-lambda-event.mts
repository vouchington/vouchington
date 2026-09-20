import type http from 'node:http'
import type { APIGatewayProxyEvent } from 'aws-lambda'

const PORT = Number(process.env.IMAGE_LAMBDA_PORT) || 3100

export function httpRequestToLambdaEvent(req: http.IncomingMessage): APIGatewayProxyEvent {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`)
  const queryStringParameters: Record<string, string> = {}
  const multiValueQueryStringParameters: Record<string, string[]> = {}
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key)
    queryStringParameters[key] = values[values.length - 1]
    multiValueQueryStringParameters[key] = values
  }

  const pathParameters: Record<string, string> = {}
  const path = url.pathname

  // S3 route: /images/{key} — key can contain slashes.
  // Path params take precedence over same-named query params, mirroring
  // API Gateway path-parameter semantics.
  const placementMatch = path.match(/^\/images\/placements\/[^/]+\/[^/]+\/(.+)$/)
  const s3Match = path.match(/^\/images\/(.+)$/)
  if (s3Match) {
    queryStringParameters.key = placementMatch?.[1] ?? s3Match[1]
  }

  // Sideload route: /sideload/{base64url} — extract base64url into pathParameters
  const sideloadMatch = path.match(/^\/sideload\/(.+)$/)
  if (sideloadMatch) {
    pathParameters.base64url = sideloadMatch[1]
  }

  // OG route: /og/{base64url} — a distinct path-parameter name from
  // sideload's `base64url` so router detection never collides between them.
  const ogMatch = path.match(/^\/og\/(.+)$/)
  if (ogMatch) {
    pathParameters.ogBase64url = ogMatch[1]
  }

  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers[key] = value
    } else if (Array.isArray(value)) {
      headers[key] = value.join(', ')
    }
  }

  return {
    path,
    httpMethod: req.method || 'GET',
    headers,
    queryStringParameters,
    pathParameters,
    body: null,
    isBase64Encoded: false,
    multiValueHeaders: {},
    multiValueQueryStringParameters,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '',
  }
}
