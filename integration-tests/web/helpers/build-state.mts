import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT_DIR = process.cwd()
const WEB_DIR = resolve(ROOT_DIR, 'web')
const WORKER_DIR = resolve(ROOT_DIR, 'cloudflare-worker')

function getMissingBuildArtifacts() {
  const requiredPaths = [
    {
      label: 'Cloudflare Worker bundle',
      path: resolve(WORKER_DIR, 'dist', 'index.js'),
    },
    {
      label: 'Next.js standalone server',
      path: resolve(WEB_DIR, '.next', 'standalone', 'web', 'server.js'),
    },
    {
      label: 'Next.js standalone public assets',
      path: resolve(WEB_DIR, '.next', 'standalone', 'web', 'public'),
    },
    {
      label: 'Next.js standalone static assets',
      path: resolve(WEB_DIR, '.next', 'standalone', 'web', '.next', 'static'),
    },
  ]

  return requiredPaths.filter(entry => !existsSync(entry.path))
}

export function ensureBuildArtifactsExist(): void {
  const missingPaths = getMissingBuildArtifacts()
  if (missingPaths.length === 0) return

  const missingSummary = missingPaths.map(entry => `${entry.label}: ${entry.path}`).join('\n')
  throw new Error(
    `[web-integration] Missing required build artifacts.\n${missingSummary}\n` +
      'Run `pnpm run test:integration:web:setup` or invoke via ' +
      '`pnpm run test:integration:web` / `pnpm run test:playwright` which build automatically.',
  )
}
