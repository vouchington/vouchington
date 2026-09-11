declare global {
  interface Window {
    __IMAGE_ORIGIN__?: string
  }
}

export function getImageOrigin(): string | undefined {
  const configured =
    typeof window !== 'undefined' ? window.__IMAGE_ORIGIN__ : process.env.IMAGE_ORIGIN
  return resolveImageOrigin(configured)
}

export function getServerImageOrigin(): string | undefined {
  return resolveImageOrigin(process.env.IMAGE_ORIGIN)
}

function resolveImageOrigin(configured: string | undefined): string | undefined {
  if (configured) return normalizeImageOrigin(configured)
  if (isDeployedEnvironment()) {
    throw new Error('IMAGE_ORIGIN must be configured as a pure HTTP(S) origin')
  }
  return undefined
}

export function normalizeImageOrigin(configured: string): string {
  let url: URL
  try {
    url = new URL(configured.trim())
  } catch (error) {
    throw new Error('IMAGE_ORIGIN must be a valid URL', { cause: error })
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('IMAGE_ORIGIN must be a pure HTTP(S) origin')
  }
  return url.origin
}

// Local, ENVIRONMENT-only check — this file is bundled into the browser, where
// `@ts-shared/deploy-environment` must not be imported (see that package's README). `ENVIRONMENT`
// is never available client-side (no `NEXT_PUBLIC_` prefix), so this always reads `false` in the
// browser; it is only meaningful for the server-side `getServerImageOrigin()` caller, where
// `process.env.ENVIRONMENT` is a genuine runtime read set by ecs-web.tf.
function isDeployedEnvironment(): boolean {
  const environment = process.env.ENVIRONMENT?.trim()
  return environment === 'staging' || environment === 'production'
}
