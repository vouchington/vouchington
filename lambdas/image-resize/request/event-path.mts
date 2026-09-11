import type { APIGatewayProxyEvent } from 'aws-lambda'

type FunctionUrlEvent = APIGatewayProxyEvent & { rawPath?: string }

export function getRequestPath(event: APIGatewayProxyEvent): string {
  return event.path || (event as FunctionUrlEvent).rawPath || ''
}

export function isSideloadRequest(event: APIGatewayProxyEvent): boolean {
  return getRequestPath(event).includes('/sideload/') || Boolean(event.pathParameters?.base64url)
}

export function getSideloadBase64url(event: APIGatewayProxyEvent): string | undefined {
  return (
    event.pathParameters?.base64url ?? getRequestPath(event).match(/^\/sideload\/([^/]+)$/)?.[1]
  )
}

// OG card requests use a distinct path segment and path-parameter name
// (`ogBase64url`, not `base64url`) so detection never collides with sideload's
// generic `pathParameters?.base64url` check. The path check is anchored to a
// single trailing segment (not a substring `.includes('/og/')` check) because
// `/og/` is short enough to appear inside legitimate S3 keys.
export function isOgRequest(event: APIGatewayProxyEvent): boolean {
  return /^\/og\/[^/]+$/.test(getRequestPath(event)) || Boolean(event.pathParameters?.ogBase64url)
}

export function getOgBase64url(event: APIGatewayProxyEvent): string | undefined {
  return event.pathParameters?.ogBase64url ?? getRequestPath(event).match(/^\/og\/([^/]+)$/)?.[1]
}
