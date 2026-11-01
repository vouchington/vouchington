// Every entry bypasses Cloudflare's worker-secret check. The static repository-policy
// script reads backend/api/app-origin-guard.mts; Vitest supplies synthetic text.

const SOURCE = 'backend/api/app-origin-guard.mts'
const EVENT_INGRESS = 'docs/overview/architecture/event-ingress.md'
const EXPECTED_ENTRIES = ['/infra/ping']
const DECLARATION = /const WORKER_SECRET_EXEMPT_PATHS = new Set\(\s*\[([\s\S]*?)\]\s*\)/

export function workerSecretExemptPathViolations(source: string): string[] {
  const match = DECLARATION.exec(source)
  if (match === null) {
    return [`${SOURCE}: missing WORKER_SECRET_EXEMPT_PATHS; see ${EVENT_INGRESS}`]
  }

  const entries = match[1]
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
  const paths = entries.map(entry => /^'([^']*)'$/.exec(entry)?.[1])
  const pinned =
    paths.length === EXPECTED_ENTRIES.length &&
    paths.every((path, index) => path === EXPECTED_ENTRIES[index])
  if (!pinned) {
    return [
      `${SOURCE}: worker-secret exempt paths must be exactly ['/infra/ping']; see ${EVENT_INGRESS}`,
    ]
  }
  return []
}
