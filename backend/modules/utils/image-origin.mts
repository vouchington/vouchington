import { isDeployedEnvironment } from '@ts-shared/deploy-environment'
import { CURRENT_SIDELOAD_PATH_PREFIX } from '@ts-shared/url-signing'

const IMAGE_ORIGIN_ENV = 'IMAGE_ORIGIN'

export function getImageOrigin(): string {
  const configured = process.env[IMAGE_ORIGIN_ENV]?.trim()
  if (configured) return parsePureHttpOrigin(configured)

  if (!isDeployedEnvironment()) {
    const port = process.env.IMAGE_LAMBDA_PORT?.trim()
    if (port) return parsePureHttpOrigin(`http://localhost:${port}`)
  }

  throw new Error(`${IMAGE_ORIGIN_ENV} must be configured as a pure HTTP(S) origin`)
}

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/backend/modules/utils/README.md`.
 */
export function getSideloadImageUrlPrefix(): string {
  return `${getImageOrigin()}${CURRENT_SIDELOAD_PATH_PREFIX}`
}

export function validateRuntimeImageOrigin(): void {
  if (isDeployedEnvironment() && process.env.NODE_PREWARM !== '1') getImageOrigin()
}

function parsePureHttpOrigin(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch (err) {
    throw new Error(`${IMAGE_ORIGIN_ENV} must be a valid URL`, { cause: err })
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${IMAGE_ORIGIN_ENV} must be a pure HTTP(S) origin`)
  }

  return url.origin
}
