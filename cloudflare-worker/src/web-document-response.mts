import type { RouteTarget } from './routing.mts'
import { isStaticWebAssetPath } from './static-web-assets.mts'

export const isHtmlResponse = (response: Response): boolean =>
  response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() === 'text/html'

export const isInvalidWebDocumentResponse = (
  response: Response,
  target: RouteTarget,
  pathname: string,
): boolean =>
  target === 'web' &&
  response.status >= 200 &&
  response.status < 300 &&
  response.status !== 204 &&
  response.status !== 205 &&
  !isStaticWebAssetPath(pathname) &&
  !isHtmlResponse(response)
