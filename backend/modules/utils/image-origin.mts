import { isDeployedEnvironment } from '@ts-shared/deploy-environment'

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

export function getSideloadImageUrlPrefix(): string {
  return `${getImageOrigin()}/sideload/`
}

export function validateRuntimeImageOrigin(): void {
  if (isDeployedEnvironment() && process.env.NODE_PREWARM !== '1') getImageOrigin()
}

function parsePureHttpOrigin(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch (cause) {
    throw new Error(`${IMAGE_ORIGIN_ENV} must be a valid URL`, { cause })
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
