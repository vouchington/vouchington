import { getImageOrigin } from './image-origin'

// Next's DefinePlugin inlines `process.env.NODE_ENV` to a build-time literal in every bundle
// (client, server, and edge), identically on staging and production. Naming this check
// isOptimizedBuild (not isDeployed/isProduction) makes the actual meaning load-bearing: this
// assertion is dead-code-eliminated from every deployed build by the bundler itself, regardless of
// deploy target, so it needs no `ENVIRONMENT` check. `ENVIRONMENT` is never available in the
// browser (no `NEXT_PUBLIC_` prefix) and swapping to an ENVIRONMENT-only check would make this
// always false client-side, firing the assertion on every real production render instead of being
// stripped from the bundle. Read per-call (not hoisted to a module constant) so tests can still
// stub NODE_ENV around individual assertions.
function isOptimizedBuild(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * In dev/test, asserts that `src` is not a raw external image URL.
 * All external images must be routed through the `/sideload/` proxy before
 * reaching the browser. Relative paths, data: URLs, and the exact configured
 * image origin are allowed.
 *
 * Inert in an optimized build — see isOptimizedBuild above.
 */
export function assertProxiedImageSrc(src: string): void {
  if (isOptimizedBuild()) return
  // Storybook stories use fixture URLs that are not sideload-proxied.
  if (process.env['VITEST_STORYBOOK_BROWSER']) return
  if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('//')) return
  const imageOrigin = getImageOrigin()
  if (imageOrigin && hasExactOrigin(src, imageOrigin)) return
  throw new Error(
    `[ProxiedImage] External image URL must be routed through /sideload/ before rendering: ${src}`,
  )
}

export function isSideloadImageSrc(src: string): boolean {
  if (src.startsWith('/sideload/')) return true
  const imageOrigin = getImageOrigin()
  if (!imageOrigin || !hasExactOrigin(src, imageOrigin)) return false

  try {
    return new URL(src).pathname.startsWith('/sideload/')
  } catch {
    return false
  }
}

function hasExactOrigin(src: string, imageOrigin: string): boolean {
  try {
    return new URL(src).origin === new URL(imageOrigin).origin
  } catch {
    return false
  }
}
